"use client";

import {
    createContext,
    useContext,
    useState,
    useEffect,
    useCallback,
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

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

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

        // Lazy-load Firebase auth and set up the listener
        (async () => {
            const { ensureFirebase, getFirebaseAuth } =
                await import("./firebase");
            await ensureFirebase();
            const auth = getFirebaseAuth();
            const { onAuthStateChanged, getRedirectResult } =
                await import("firebase/auth");

            // Wait for redirect result first so we don't flash "Guest" state
            let redirectUser: User | null = null;
            try {
                const result = await getRedirectResult(auth);
                if (result?.user) {
                    redirectUser = result.user;
                }
            } catch (err) {
                console.error("[auth] Redirect result error:", err);
            }

            // If redirect gave us a user, set it immediately
            if (redirectUser) {
                setUser(redirectUser);
                setCurrentUid(redirectUser.uid);
                setLoading(false);
                try {
                    const { syncUserData } = await import("./sync");
                    await syncUserData(redirectUser.uid);
                } catch (e) {
                    console.error("[auth] Background sync failed:", e);
                }
            }

            unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
                if (firebaseUser) {
                    setUser(firebaseUser);
                    setCurrentUid(firebaseUser.uid);
                    // Only sync if this isn't the redirect user we already handled
                    if (
                        !redirectUser ||
                        firebaseUser.uid !== redirectUser.uid
                    ) {
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
            const { ensureFirebase, getFirebaseAuth, getGoogleProvider } =
                await import("./firebase");
            await ensureFirebase();
            const auth = getFirebaseAuth();
            const provider = getGoogleProvider();
            const { signInWithRedirect } = await import("firebase/auth");
            await signInWithRedirect(auth, provider);
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
