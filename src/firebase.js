import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
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

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Export Auth & Firestore
export const auth = getAuth(app);
export const db = getFirestore(app);

// Initialize Messaging safely (checks if browser supports push notifications)
export let messaging = null;
if (typeof window !== "undefined") {
  isSupported().then((supported) => {
    if (supported) {
      messaging = getMessaging(app);
    }
  }).catch((err) => {
    console.warn("Firebase Messaging not supported:", err);
  });
}

// Initialize Analytics safely
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