// firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAe3-qMRUVjYeBOW-OBZUApNn9IpTecGGk",
  authDomain: "readandrise-e1420.firebaseapp.com",
  projectId: "readandrise-e1420",
  storageBucket: "readandrise-e1420.firebasestorage.app",
  messagingSenderId: "685156970755",
  appId: "1:685156970755:web:04d9c685084b2df835f936",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification?.title || 'إشعار جديد';
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: '/images/logo.png',
    badge: '/images/badge.png',
    data: payload.data || {},
    requireInteraction: true,
  };
  self.registration.showNotification(notificationTitle, notificationOptions);
});