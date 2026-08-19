import { initializeApp } from 'firebase/app';
import { initializeAuth, browserLocalPersistence } from 'firebase/auth';
import { firebaseApp } from '../firebase';

const secondaryApp = initializeApp(firebaseApp.options, 'secondary');

const authMain = initializeAuth(firebaseApp, {
  persistence: browserLocalPersistence
});

const secondaryAuth = initializeAuth(secondaryApp, {
  persistence: browserLocalPersistence
});

export const authInstance = authMain;
export const auth = authMain;
export { secondaryAuth };