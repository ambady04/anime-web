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
            const { onAuthStateChanged } = await import("firebase/auth");

            unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
                if (firebaseUser) {
                    setUser(firebaseUser);
                    // Perform background sync on successful authentication
                    try {
                        const { syncUserData } = await import("./sync");
                        await syncUserData(firebaseUser.uid);
                    } catch (e) {
                        console.error("[auth] Background sync failed:", e);
                    }
                } else {
                    setUser(null);
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
            const { signInWithPopup } = await import("firebase/auth");
            await signInWithPopup(auth, provider);
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
