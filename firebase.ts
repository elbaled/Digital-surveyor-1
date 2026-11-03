import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
export const firebaseConfigured = Boolean(config.apiKey && config.projectId && config.appId);
let app: FirebaseApp | undefined;
if (typeof window !== 'undefined' && firebaseConfigured) app = getApps().length ? getApps()[0] : initializeApp(config);
export const getFirebaseAuth = (): Auth | null => app ? getAuth(app) : null;
export const getFirebaseDb = (): Firestore | null => app ? getFirestore(app) : null;
