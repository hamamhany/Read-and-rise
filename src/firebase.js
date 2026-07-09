import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth"; 
import { getFirestore } from "firebase/firestore"; 

const firebaseConfig = {
  apiKey: "AIzaSyAe3-qMRUVjYeBOW-OBZUApNn9IpTecGGk",
  authDomain: "readandrise-e1420.firebaseapp.com",
  projectId: "readandrise-e1420",
  storageBucket: "readandrise-e1420.firebasestorage.app",
  messagingSenderId: "685156970755",
  appId: "1:685156970755:web:04d9c685084b2df835f936",
  measurementId: "G-4LKJCL8PV2"
};

const app = initializeApp(firebaseConfig);
export const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const db = getFirestore(app);