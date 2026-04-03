import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// ⚠️  REPLACE THESE VALUES WITH YOUR FIREBASE PROJECT CONFIG
// Go to: Firebase Console → Project Settings → Your Apps → SDK setup and configuration
const firebaseConfig = {
  apiKey: "AIzaSyCRSWBqGLW0EPnXCEKJbdE5d9ab5x45z7U",
  authDomain: "alfoattendance.firebaseapp.com",
  projectId: "alfoattendance",
  storageBucket: "alfoattendance.firebasestorage.app",
  messagingSenderId: "894064008914	",
  appId: "1:894064008914:web:f5eab3d29a82b93e23970b"
};

const app = initializeApp(firebaseConfig);

// Secondary app instance — used only by admin to create new user accounts
// without affecting the currently logged-in admin session
const secondaryApp = initializeApp(firebaseConfig, 'Secondary');

export const auth = getAuth(app);
export const secondaryAuth = getAuth(secondaryApp);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
