import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeAuth, browserLocalPersistence, getAuth } from "firebase/auth";
import { initializeFirestore, getFirestore, memoryLocalCache } from "firebase/firestore";
import { getMessaging } from "firebase/messaging";
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

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

let authInstance;
try {
  authInstance = initializeAuth(app, { persistence: browserLocalPersistence });
} catch (e) {
  authInstance = getAuth(app);
}
export const auth = authInstance;

const secondaryAppNames = getApps().map(a => a.name);
const secondaryApp = secondaryAppNames.includes('secondary')
  ? getApp('secondary')
  : initializeApp(firebaseConfig, 'secondary');

let secondaryAuthInstance;
try {
  secondaryAuthInstance = initializeAuth(secondaryApp, { persistence: browserLocalPersistence });
} catch (e) {
  secondaryAuthInstance = getAuth(secondaryApp);
}
export const secondaryAuth = secondaryAuthInstance;

export const firebaseApp = app;

let dbInstance;
try {
  dbInstance = initializeFirestore(app, { localCache: memoryLocalCache() });
} catch (e) {
  dbInstance = getFirestore(app);
}
export const db = dbInstance;

// ✅ messaging متزامن - يعمل فوراً عند الاستيراد
export let messaging = null;
try {
  if (typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window) {
    messaging = getMessaging(app);
  }
} catch (err) {
  console.warn("Firebase Messaging not supported:", err);
}

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