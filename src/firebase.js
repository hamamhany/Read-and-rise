import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeAuth, browserLocalPersistence, getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getMessaging, isSupported } from "firebase/messaging";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

// 1. تهيئة التطبيق الأساسي مع التحقق من وجوده لمنع الأخطاء أثناء التحديث المباشر
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// 2. تهيئة المصادقة الأساسية وحفظ الجلسة محلياً لمنع مشاكل الـ iframe
let authInstance;
try {
  authInstance = initializeAuth(app, {
    persistence: browserLocalPersistence
  });
} catch (e) {
  authInstance = getAuth(app);
}
export const auth = authInstance;

// 3. التطبيق الثانوي (المُستخدم لإنشاء حسابات بدون تسجبل الخروج من الحساب الحالي)
const secondaryAppNames = getApps().map(a => a.name);
const secondaryApp = secondaryAppNames.includes('secondary')
  ? getApp('secondary')
  : initializeApp(firebaseConfig, 'secondary');

let secondaryAuthInstance;
try {
  secondaryAuthInstance = initializeAuth(secondaryApp, {
    persistence: browserLocalPersistence
  });
} catch (e) {
  secondaryAuthInstance = getAuth(secondaryApp);
}
export const secondaryAuth = secondaryAuthInstance;

// 4. تصدير التطبيق وقاعدة البيانات Firestore
export const firebaseApp = app;
export const db = getFirestore(app);

// 5. تهيئة Firebase Messaging (دعم الإشعارات)
export let messaging = null;
if (typeof window !== "undefined") {
  isSupported()
    .then((supported) => {
      if (supported) {
        messaging = getMessaging(app);
      }
    })
    .catch((err) => {
      console.warn("Firebase Messaging not supported:", err);
    });
}

// 6. تهيئة Google Analytics
let analytics = null;
if (typeof window !== "undefined") {
  try {
    analytics = getAnalytics(app);
  } catch (e) {
    console.warn("Analytics initialization failed:", e);
  }
}
export { analytics };

export default app;