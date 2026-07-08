import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Fallback to your actual Firebase config values if environment variables are not loaded
const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyAfXBM_IoYDWuqlzfYiEFhpyAyNkN_1ndU",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "anime-f36fe.firebaseapp.com",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "anime-f36fe",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "anime-f36fe.firebasestorage.app",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "529404604464",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:529404604464:web:26807e3dd2f72acc1abdf5",
};

// Initialize Firebase with Server-Side Rendering (SSR) / build-time compatibility
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
const db = getFirestore(app);

// Use Google Auth popup by default, set custom parameters if needed
googleProvider.setCustomParameters({ prompt: 'select_account' });

export { app, auth, googleProvider, db };
