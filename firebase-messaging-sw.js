// GLAMR — Firebase Messaging service worker
// This file MUST live at the root of your site (same folder as index.html),
// reachable at exactly yoursite.com/firebase-messaging-sw.js — that's the
// path the app registers in Index.html. It can't import your app's other
// config, so the same public firebaseConfig values are repeated here.

importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyD9jF2VjmPcrygU_xNm2fGjJZAURAac8Y8",
  authDomain: "glamr-33934.firebaseapp.com",
  projectId: "glamr-33934",
  storageBucket: "glamr-33934.firebasestorage.app",
  messagingSenderId: "467391315343",
  appId: "1:467391315343:web:10fa18e796644f5927dffa",
});

const messaging = firebase.messaging();

// Fires when a push arrives while the app is closed/in the background —
// this is the actual "phone buzzes with a real notification" moment.
messaging.onBackgroundMessage(function (payload) {
  const title = (payload.notification && payload.notification.title) || "GLAMR";
  const body = (payload.notification && payload.notification.body) || "";
  const link = (payload.data && payload.data.link) || "/";

  self.registration.showNotification(title, {
    body: body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { link: link },
  });
});

// Tapping the notification opens (or focuses) the app at the right screen —
// e.g. straight to the one-tap "mark as booked" confirm link for that opening.
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (windowClients) {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if ("focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(link);
    })
  );
});
