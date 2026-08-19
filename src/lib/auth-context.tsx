"use client";

import {
    createContext,
    useContext,
    useState,
    useEffect,
    useCallback,
    useRef,
    ReactNode,
} from "react";
import type { User } from "firebase/auth";
import { setCurrentUid } from "./storage";

interface AuthContextType {
    user: User | null;
    loading: boolean;
    loginWithGoogle: () => Promise<void>;
    logout: () => Promise<void>;
    triggerSync: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Pre-load Firebase auth module so signInWithPopup runs synchronously after click
let _firebasePreloaded = false;
let _preloadPromise: Promise<void> | null = null;

function preloadFirebase() {
    if (_preloadPromise) return _preloadPromise;
    _preloadPromise = (async () => {
        const { ensureFirebase } = await import("./firebase");
        await ensureFirebase();
        await import("firebase/auth");
        _firebasePreloaded = true;
    })();
    return _preloadPromise;
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const syncedRef = useRef(false);

    // Manual or programmatic synchronization trigger
    const triggerSync = useCallback(async () => {
        const { ensureFirebase, getFirebaseAuth } = await import("./firebase");
        await ensureFirebase();
        const auth = getFirebaseAuth();
        if (auth.currentUser) {
            const { syncUserData } = await import("./sync");
            await syncUserData(auth.currentUser.uid);
        }
    }, []);

    useEffect(() => {
        let unsubscribe: (() => void) | null = null;

        (async () => {
            // Pre-load Firebase so login click is faster
            await preloadFirebase();

            const { getFirebaseAuth } = await import("./firebase");
            const auth = getFirebaseAuth();
            const { onAuthStateChanged } = await import("firebase/auth");

            unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
                if (firebaseUser) {
                    setUser(firebaseUser);
                    setCurrentUid(firebaseUser.uid);
                    if (!syncedRef.current) {
                        syncedRef.current = true;
                        try {
                            const { syncUserData } = await import("./sync");
                            await syncUserData(firebaseUser.uid);
                        } catch (e) {
                            console.error("[auth] Background sync failed:", e);
                        }
                    }
                } else {
                    setUser(null);
                    setCurrentUid(null);
                    syncedRef.current = false;
                }
                setLoading(false);
            });
        })();

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    const loginWithGoogle = useCallback(async () => {
        try {
            // Ensure Firebase is ready (should already be preloaded)
            if (!_firebasePreloaded) {
                await preloadFirebase();
            }

            const { getFirebaseAuth, getGoogleProvider } =
                await import("./firebase");
            const auth = getFirebaseAuth();
            const provider = getGoogleProvider();
            const { signInWithPopup } = await import("firebase/auth");
            await signInWithPopup(auth, provider);
        } catch (error: unknown) {
            // Suppress popup-blocked/closed errors since user can retry
            if (
                error instanceof Error &&
                "code" in error &&
                ((error as { code: string }).code === "auth/popup-blocked" ||
                    (error as { code: string }).code ===
                        "auth/popup-closed-by-user")
            ) {
                console.warn(
                    "[auth] Popup blocked by browser. Disable ad-blocker or allow popups for this site.",
                );
                return;
            }
            console.error("Google Auth login failed:", error);
            throw error;
        }
    }, []);

    const logout = useCallback(async () => {
        try {
            const { ensureFirebase, getFirebaseAuth } =
                await import("./firebase");
            await ensureFirebase();
            const auth = getFirebaseAuth();
            const { signOut } = await import("firebase/auth");
            await signOut(auth);
            setUser(null);
            setCurrentUid(null);
        } catch (error) {
            console.error("Google Auth logout failed:", error);
            throw error;
        }
    }, []);

    return (
        <AuthContext.Provider
            value={{ user, loading, loginWithGoogle, logout, triggerSync }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
