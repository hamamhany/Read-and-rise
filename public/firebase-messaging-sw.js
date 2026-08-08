// ============================================================
// ملف Service Worker للإشعارات - النسخة النهائية الجاهزة
// ============================================================
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// ✅ جميع المفاتيح تم تعبئتها بقيمك الفعلية (بما فيها App ID الصحيح)
const firebaseConfig = {
  apiKey: "AIzaSyDpegD8hIijxH-0xtj_st0FprTOuWM66AU",
  authDomain: "read-and-rise-new.firebaseapp.com",
  projectId: "read-and-rise-new",
  storageBucket: "read-and-rise-new.firebasestorage.app",
  messagingSenderId: "36140681803",
  appId: "1:36140681803:web:7ad63562be2a7ba56c5bce",  // ✅ تم التصحيح
  measurementId: "G-YJXD3GHYD2"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('📩 تلقيت رسالة خلفية:', payload);
  self.registration.showNotification(
    payload.notification?.title || 'إشعار جديد',
    {
      body: payload.notification?.body || '',
      icon: '/logo.png'
    }
  );
});