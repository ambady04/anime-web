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

// Pre-load Firebase auth module eagerly
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
            await preloadFirebase();

            const { getFirebaseAuth } = await import("./firebase");
            const auth = getFirebaseAuth();
            const { onAuthStateChanged, getRedirectResult } =
                await import("firebase/auth");

            // Process redirect result (resolves the credential after redirect sign-in)
            try {
                await getRedirectResult(auth);
            } catch (err) {
                console.error("[auth] Redirect result error:", err);
            }

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
            if (!_firebasePreloaded) {
                await preloadFirebase();
            }

            const { getFirebaseAuth, getGoogleProvider } =
                await import("./firebase");
            const auth = getFirebaseAuth();
            const provider = getGoogleProvider();
            const { signInWithPopup, signInWithRedirect } =
                await import("firebase/auth");

            // Try popup first, fall back to redirect if blocked
            try {
                await signInWithPopup(auth, provider);
            } catch (popupErr: unknown) {
                const code =
                    popupErr instanceof Error && "code" in popupErr
                        ? (popupErr as { code: string }).code
                        : "";
                if (
                    code === "auth/popup-blocked" ||
                    code === "auth/popup-closed-by-user"
                ) {
                    // Popup blocked — use redirect (navigates away from page)
                    await signInWithRedirect(auth, provider);
                } else {
                    throw popupErr;
                }
            }
        } catch (error) {
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
