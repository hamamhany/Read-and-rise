import { auth as authMain, secondaryAuth as secondaryAuthInstance } from '../firebase';

export const authInstance = authMain;
export const auth = authMain;
export const secondaryAuth = secondaryAuthInstance;