// GLAMR — Cloud Functions for push notifications
// ------------------------------------------------
// If you already have a Cloud Functions project for GLAMR with its own
// index.js, don't overwrite it wholesale — copy the two exports below into
// it (and the admin.initializeApp() block only if it doesn't already have
// one). If this is your first Cloud Function for GLAMR, this file is a
// complete, ready-to-deploy functions/index.js on its own.
//
// Setup (same shape as any Firebase Functions project):
//   1. firebase init functions   (if you haven't already, inside your
//      GLAMR project folder — choose the existing glamr-33934 project)
//   2. Put this file at functions/index.js
//   3. firebase deploy --only functions

const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

const SITE_URL = "https://glamr.space/";

// ---------------------------------------------------------------
// 1. INSTANT LEAD ALERT — fires the moment someone taps "Book with
// Provider" (Instagram or website) on one of a specialist's openings.
// This replaces the old manual step of texting/emailing the specialist
// the confirm link yourself — the notification itself now IS that
// delivery, and tapping it deep-links straight to the one-tap "mark as
// booked" confirm screen for that exact opening.
//
// Honest wording matters here: GLAMR only knows someone CLICKED to book,
// not that a booking actually happened (that part happens in DMs, off
// platform) — so this says "wants to book you", not "booked you".
//
// pushSent gates this to once per opening per "round" (reset when the
// specialist reactivates a closed/booked opening — see toggle-opening in
// Index.html) so 5 clicks from 5 different customers doesn't mean 5
// separate pings for the same opening.
// ---------------------------------------------------------------
exports.notifyBookingClick = onDocumentUpdated("openings/{openingId}", async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const openingId = event.params.openingId;

  const clicksIncreased = (after.clicks || 0) > (before.clicks || 0);
  if (!clicksIncreased || after.pushSent) return;

  const providerDoc = await db.collection("providers").doc(after.providerId).get();
  const provider = providerDoc.data();
  if (!provider || !provider.notificationsEnabled || !provider.fcmToken) return;

  const message = {
    token: provider.fcmToken,
    notification: {
      title: "New booking interest! 💇",
      body: `Someone wants to book your ${after.service} opening — check your DMs, then tap to confirm once it's locked in.`,
    },
    data: { link: `${SITE_URL}?confirm=${openingId}` },
  };

  try {
    await messaging.send(message);
    await event.data.after.ref.update({ pushSent: true });
  } catch (e) {
    console.error("notifyBookingClick failed for opening", openingId, e);
  }
});

// ---------------------------------------------------------------
// 2. CHECK-IN REMINDER — for an opening that got a click but was never
// marked "booked" (or reactivated), nudge the specialist to go check
// whether it actually turned into a real booking. Runs every 2 hours;
// fires once per opening (bookingReminderSent), resets same as pushSent
// when an opening is reactivated.
//
// FIREBASE_FUNCTIONS_TODO: 2 hours is a starting guess for "long enough
// that they've had a chance to check DMs, short enough to still be
// useful" — adjust the REMINDER_DELAY_MS constant below if that's not
// the right window in practice.
// ---------------------------------------------------------------
const REMINDER_DELAY_MS = 2 * 60 * 60 * 1000; // 2 hours

exports.remindToConfirmBooking = onSchedule("every 2 hours", async (event) => {
  const now = Date.now();

  const dueSnap = await db.collection("openings")
    .where("status", "==", "active")
    .where("bookingReminderSent", "==", false)
    .get();

  const sends = [];

  dueSnap.forEach((doc) => {
    const o = doc.data();
    if (!o.clicks || o.clicks === 0) return; // nobody's clicked yet — nothing to remind about
    if (!o.lastClickAt) return;
    const clickedAt = o.lastClickAt.toMillis ? o.lastClickAt.toMillis() : 0;
    if (now - clickedAt < REMINDER_DELAY_MS) return; // not due yet

    sends.push(
      (async () => {
        const providerDoc = await db.collection("providers").doc(o.providerId).get();
        const provider = providerDoc.data();
        if (provider && provider.notificationsEnabled && provider.fcmToken) {
          try {
            await messaging.send({
              token: provider.fcmToken,
              notification: {
                title: "Did you get booked? 👀",
                body: `Someone showed interest in your ${o.service} opening a couple hours ago — check your DMs and confirm if it's locked in.`,
              },
              data: { link: `${SITE_URL}?confirm=${doc.id}` },
            });
          } catch (e) {
            console.error("remindToConfirmBooking send failed for opening", doc.id, e);
          }
        }
        // Mark it sent either way — this is a one-time nudge per opening,
        // not a repeating alarm, so it shouldn't keep re-firing every 2
        // hours forever even if notifications are off or the send fails.
        await doc.ref.update({ bookingReminderSent: true });
      })()
    );
  });

  await Promise.all(sends);
  console.log(`Checked ${dueSnap.size} unconfirmed openings, sent ${sends.length} reminders.`);
});
