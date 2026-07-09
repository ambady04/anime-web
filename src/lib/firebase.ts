import { type FirebaseApp } from "firebase/app";
import {
    type Auth,
    type GoogleAuthProvider as GoogleAuthProviderType,
} from "firebase/auth";
import { type Firestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey:
        process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
        "AIzaSyAfXBM_IoYDWuqlzfYiEFhpyAyNkN_1ndU",
    authDomain:
        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
        "anime-f36fe.firebaseapp.com",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "anime-f36fe",
    storageBucket:
        process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
        "anime-f36fe.firebasestorage.app",
    messagingSenderId:
        process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "529404604464",
    appId:
        process.env.NEXT_PUBLIC_FIREBASE_APP_ID ||
        "1:529404604464:web:26807e3dd2f72acc1abdf5",
};

// Lazy-loaded Firebase instances — only initialized when first accessed.
// This prevents the ~360KB Firebase bundle from loading on initial page render.
let _app: FirebaseApp | null = null;
let _auth: Auth | null = null;
let _googleProvider: GoogleAuthProviderType | null = null;
let _db: Firestore | null = null;

let _initPromise: Promise<void> | null = null;

async function initFirebase() {
    if (_app) return;

    const { initializeApp, getApps, getApp } = await import("firebase/app");
    const { getAuth, GoogleAuthProvider } = await import("firebase/auth");
    const { getFirestore } = await import("firebase/firestore");

    _app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
    _auth = getAuth(_app);
    _googleProvider = new GoogleAuthProvider();
    _googleProvider.setCustomParameters({ prompt: "select_account" });
    _db = getFirestore(_app);
}

/**
 * Ensures Firebase is initialized. Call this before accessing auth/db/etc.
 * Returns immediately if already initialized. Safe to call multiple times.
 */
export async function ensureFirebase() {
    if (_app) return;
    if (!_initPromise) {
        _initPromise = initFirebase();
    }
    await _initPromise;
}

// Getters that throw if accessed before initialization
// (These are only used after ensureFirebase() is awaited)
export function getFirebaseAuth(): Auth {
    if (!_auth)
        throw new Error(
            "Firebase not initialized. Call ensureFirebase() first.",
        );
    return _auth;
}

export function getFirebaseDb(): Firestore {
    if (!_db)
        throw new Error(
            "Firebase not initialized. Call ensureFirebase() first.",
        );
    return _db;
}

export function getGoogleProvider(): GoogleAuthProviderType {
    if (!_googleProvider)
        throw new Error(
            "Firebase not initialized. Call ensureFirebase() first.",
        );
    return _googleProvider;
}

// Legacy exports for backward compatibility — these are synchronous getters
// that work ONLY after ensureFirebase() has resolved.
// Components using these MUST call ensureFirebase() in useEffect first.
Object.defineProperty(exports, "auth", {
    get: () => _auth,
    enumerable: true,
});

Object.defineProperty(exports, "db", {
    get: () => _db,
    enumerable: true,
});

Object.defineProperty(exports, "googleProvider", {
    get: () => _googleProvider,
    enumerable: true,
});

Object.defineProperty(exports, "app", {
    get: () => _app,
    enumerable: true,
});

// Type exports for legacy code
export type { FirebaseApp } from "firebase/app";
export type { Auth } from "firebase/auth";
export type { Firestore } from "firebase/firestore";
