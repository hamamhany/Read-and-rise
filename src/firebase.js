import { initializeApp } from "firebase/app";
import { initializeAuth, browserLocalPersistence } from "firebase/auth";
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

// التطبيق الأساسي
const app = initializeApp(firebaseConfig);

// ✅ المصادقة الأساسية مع persistence محلي (يمنع تحميل iframe إضافي)
export const auth = initializeAuth(app, {
  persistence: browserLocalPersistence
});

// التطبيق الثانوي (يُستخدم لإنشاء حسابات جديدة دون التأثير على الجلسة الحالية)
const secondaryApp = initializeApp(firebaseConfig, 'secondary');

// ✅ المصادقة الثانوية مع persistence محلي
export const secondaryAuth = initializeAuth(secondaryApp, {
  persistence: browserLocalPersistence
});

// تصدير التطبيق الأساسي لاستخدامه في حال الحاجة
export const firebaseApp = app;

// Firestore
export const db = getFirestore(app);

// Firebase Messaging (دعم الإشعارات)
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

// Google Analytics (آمن)
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