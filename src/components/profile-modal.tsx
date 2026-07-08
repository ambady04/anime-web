"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { 
  X, 
  ShieldAlert, 
  Trash2, 
  LogOut, 
  RefreshCw, 
  Cloud, 
  User as UserIcon,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
    const { user, loginWithGoogle, logout, triggerSync } = useAuth();
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [showDeleteCloudConfirm, setShowDeleteCloudConfirm] = useState(false);
    
    const [isSyncing, setIsSyncing] = useState(false);
    const [isDeletingCloud, setIsDeletingCloud] = useState(false);
    const [syncMessage, setSyncMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");

    // Statistics state from Cloud Firestore
    const [counts, setCounts] = useState({ watchlist: 0, history: 0, episodes: 0 });
    const [loadingCounts, setLoadingCounts] = useState(false);

    // Fetch cloud sync metrics
    const fetchCloudCounts = async (uid: string) => {
        setLoadingCounts(true);
        try {
            const { db } = await import("@/lib/firebase");
            const { collection, getDocs } = await import("firebase/firestore");
            
            const [watchlistSnap, historySnap, episodesSnap] = await Promise.all([
                getDocs(collection(db, "users", uid, "watchlist")),
                getDocs(collection(db, "users", uid, "history")),
                getDocs(collection(db, "users", uid, "watched_episodes"))
            ]);
            
            setCounts({
                watchlist: watchlistSnap.size,
                history: historySnap.size,
                episodes: episodesSnap.size
            });
        } catch (err) {
            console.error("[profile] Failed to fetch cloud sync statistics:", err);
        } finally {
            setLoadingCounts(false);
        }
    };

    // Load counts when opening modal or logging in
    useEffect(() => {
        if (isOpen && user) {
            fetchCloudCounts(user.uid);
        } else if (!user) {
            setCounts({ watchlist: 0, history: 0, episodes: 0 });
        }
    }, [isOpen, user]);

    const handleGoogleLogin = async () => {
        setErrorMessage("");
        try {
            await loginWithGoogle();
        } catch (err: any) {
            setErrorMessage(err.message || "Failed to log in with Google.");
        }
    };

    const handleLogout = async () => {
        setErrorMessage("");
        try {
            await logout();
            onClose();
        } catch (err: any) {
            setErrorMessage(err.message || "Failed to log out.");
        }
    };

    const handleSync = async () => {
        if (!user) return;
        setIsSyncing(true);
        setSyncMessage("");
        try {
            await triggerSync();
            setSyncMessage("Data successfully synced with Cloud!");
            await fetchCloudCounts(user.uid); // Refresh counts after sync completes
            setTimeout(() => setSyncMessage(""), 4000);
        } catch (err: any) {
            setErrorMessage("Failed to synchronize data.");
        } finally {
            setIsSyncing(false);
        }
    };

    const handleDeleteCloudData = async () => {
        if (!user) return;
        setIsDeletingCloud(true);
        setErrorMessage("");
        try {
            const { db } = await import("@/lib/firebase");
            const { collection, getDocs, writeBatch } = await import("firebase/firestore");
            const uid = user.uid;

            // Fetch all subcollection documents
            const [watchlistSnap, historySnap, episodesSnap] = await Promise.all([
                getDocs(collection(db, "users", uid, "watchlist")),
                getDocs(collection(db, "users", uid, "history")),
                getDocs(collection(db, "users", uid, "watched_episodes"))
            ]);

            const batch = writeBatch(db);
            watchlistSnap.forEach((doc: any) => batch.delete(doc.ref));
            historySnap.forEach((doc: any) => batch.delete(doc.ref));
            episodesSnap.forEach((doc: any) => batch.delete(doc.ref));

            await batch.commit();

            setCounts({ watchlist: 0, history: 0, episodes: 0 });
            setSyncMessage("All cloud synced data has been deleted.");
            setShowDeleteCloudConfirm(false);
            setTimeout(() => setSyncMessage(""), 4000);
        } catch (err: any) {
            console.error("[profile] Failed to delete cloud data:", err);
            setErrorMessage("Failed to delete cloud data.");
        } finally {
            setIsDeletingCloud(false);
        }
    };

    const handleResetData = () => {
        // Clear local storage and cookies, then refresh
        localStorage.clear();
        sessionStorage.clear();
        if (typeof document !== "undefined") {
            const cookies = document.cookie.split(";");
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i];
                const eqPos = cookie.indexOf("=");
                const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
                document.cookie = name.trim() + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
            }
        }
        window.location.reload();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        transition={{ type: "spring", duration: 0.4 }}
                        className="relative w-full max-w-md bg-zinc-950/90 backdrop-blur-md border border-white/10 p-6 rounded-3xl shadow-2xl space-y-6 z-10 overflow-hidden"
                    >
                        {/* Close button */}
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 p-2 rounded-xl text-foreground/50 hover:text-white hover:bg-white/5 transition-colors focus:outline-none cursor-pointer"
                        >
                            <X className="w-4 h-4" />
                        </button>

                        {showResetConfirm ? (
                            /* RESET LOCAL DATA CONFIRMATION VIEW */
                            <div className="space-y-6">
                                <div className="flex flex-col items-center text-center space-y-3 select-none">
                                    <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-lg shadow-primary-glow/10 animate-bounce">
                                        <ShieldAlert className="w-6 h-6" />
                                    </div>
                                    <h3 className="text-lg font-black text-white uppercase tracking-wider">
                                        Reset Application Data
                                    </h3>
                                    <p className="text-xs text-foreground/60 font-medium max-w-xs leading-relaxed">
                                        If you are experiencing stream errors, loading issues, or broken player states, clearing your local storage can restore normal playback.
                                    </p>
                                </div>

                                <div className="bg-white/5 border border-white/5 rounded-2xl p-4 space-y-3 text-xs">
                                    <div className="flex items-center justify-between text-white/80">
                                        <span className="font-semibold">Local Watchlist / Bookmarks</span>
                                        <span className="text-primary font-bold">Will be cleared</span>
                                    </div>
                                    <div className="flex items-center justify-between text-white/80 border-t border-white/5 pt-3">
                                        <span className="font-semibold">Local Playback History</span>
                                        <span className="text-primary font-bold">Will be cleared</span>
                                    </div>
                                    <div className="flex items-center justify-between text-white/80 border-t border-white/5 pt-3">
                                        <span className="font-semibold">Cookies & Browser Cache</span>
                                        <span className="text-primary font-bold">Will be cleared</span>
                                    </div>
                                </div>

                                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                                    <button
                                        onClick={() => setShowResetConfirm(false)}
                                        className="flex-1 px-4 py-3 rounded-xl border border-glass-border text-foreground/75 hover:text-white hover:bg-white/5 transition-colors text-xs font-bold uppercase tracking-wider cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleResetData}
                                        className="flex-1 px-4 py-3 rounded-xl bg-primary hover:bg-primary-light text-white transition-all text-xs font-bold uppercase tracking-wider shadow-lg shadow-primary-glow cursor-pointer flex items-center justify-center space-x-1.5"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        <span>Reset App</span>
                                    </button>
                                </div>
                            </div>
                        ) : showDeleteCloudConfirm ? (
                            /* DELETE CLOUD DATA CONFIRMATION VIEW */
                            <div className="space-y-6">
                                <div className="flex flex-col items-center text-center space-y-3 select-none">
                                    <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 shadow-lg shadow-red-glow/10 animate-pulse">
                                        <ShieldAlert className="w-6 h-6" />
                                    </div>
                                    <h3 className="text-lg font-black text-white uppercase tracking-wider">
                                        Delete Cloud Synced Data
                                    </h3>
                                    <p className="text-xs text-foreground/60 font-medium max-w-xs leading-relaxed">
                                        This will permanently delete all your bookmarks, watch history, and episode progress saved in your Google sync account.
                                    </p>
                                </div>

                                <div className="bg-white/5 border border-white/5 rounded-2xl p-4 space-y-3 text-xs">
                                    <div className="flex items-center justify-between text-white/80">
                                        <span className="font-semibold">Cloud Watchlist / Bookmarks</span>
                                        <span className="text-red-400 font-bold">Will be deleted</span>
                                    </div>
                                    <div className="flex items-center justify-between text-white/80 border-t border-white/5 pt-3">
                                        <span className="font-semibold">Cloud Playback History</span>
                                        <span className="text-red-400 font-bold">Will be deleted</span>
                                    </div>
                                    <div className="flex items-center justify-between text-white/80 border-t border-white/5 pt-3">
                                        <span className="font-semibold">Cloud Episode Progress</span>
                                        <span className="text-red-400 font-bold">Will be deleted</span>
                                    </div>
                                </div>

                                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-[10px] text-red-400 font-medium text-center">
                                    Your local browser data will remain untouched. Only your cloud sync backup will be erased.
                                </div>

                                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                                    <button
                                        onClick={() => setShowDeleteCloudConfirm(false)}
                                        className="flex-1 px-4 py-3 rounded-xl border border-glass-border text-foreground/75 hover:text-white hover:bg-white/5 transition-colors text-xs font-bold uppercase tracking-wider cursor-pointer"
                                        disabled={isDeletingCloud}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleDeleteCloudData}
                                        disabled={isDeletingCloud}
                                        className="flex-1 px-4 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white transition-all text-xs font-bold uppercase tracking-wider shadow-lg shadow-red-glow cursor-pointer flex items-center justify-center space-x-1.5 disabled:opacity-50"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        <span>{isDeletingCloud ? "Deleting..." : "Delete Cloud"}</span>
                                    </button>
                                </div>
                            </div>
                        ) : (
                            /* MAIN PROFILE MODAL INTERFACE (Guest vs Auth) */
                            <>
                                {/* Header */}
                                <div className="flex flex-col items-center text-center space-y-2 select-none">
                                    <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-lg shadow-primary-glow/10">
                                        <Cloud className="w-6 h-6" />
                                    </div>
                                    <h3 className="text-lg font-black text-white uppercase tracking-wider">
                                        Account & Cloud Sync
                                    </h3>
                                    <p className="text-xs text-foreground/60 max-w-xs leading-relaxed">
                                        Sync your bookmarks, playback history, and watched episodes across all your devices automatically.
                                    </p>
                                </div>

                                {/* Error messages */}
                                {errorMessage && (
                                    <div className="flex items-center space-x-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 font-medium">
                                        <AlertCircle className="w-4 h-4 shrink-0" />
                                        <span>{errorMessage}</span>
                                    </div>
                                )}

                                {/* Main Section: Guest vs User */}
                                {!user ? (
                                    /* GUEST VIEW */
                                    <div className="space-y-4 pt-2">
                                        <div className="bg-white/5 border border-white/5 rounded-2xl p-4 text-xs text-foreground/70 space-y-2 leading-relaxed">
                                            <p className="font-semibold text-white">Why sign in?</p>
                                            <ul className="list-disc pl-4 space-y-1.5">
                                                <li>Keep your Watchlist safe even if you clear cookies.</li>
                                                <li>Resume watch progress exactly where you left off on mobile or desktop.</li>
                                                <li>Synchronize episode checklists instantly.</li>
                                            </ul>
                                        </div>

                                        <button
                                            onClick={handleGoogleLogin}
                                            className="w-full flex items-center justify-center space-x-3 py-3 px-4 rounded-xl bg-white text-zinc-950 hover:bg-zinc-100 font-bold text-xs uppercase tracking-wider transition-all duration-300 shadow-md shadow-white/5 hover:scale-[1.01] cursor-pointer"
                                        >
                                            <svg className="w-4 h-4" viewBox="0 0 24 24">
                                                <path
                                                    fill="#EA4335"
                                                    d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114-3.535 0-6.4-2.865-6.4-6.4s2.865-6.4 6.4-6.4c1.558 0 2.977.562 4.092 1.488l3.078-3.078C19.123 2.215 15.86 1 12 1 5.925 1 1 5.925 1 12s4.925 11 11 11c6.545 0 11.23-4.596 11.23-11.23 0-.64-.076-1.127-.174-1.485H12.24Z"
                                                />
                                            </svg>
                                            <span>Sign In with Google</span>
                                        </button>
                                    </div>
                                ) : (
                                    /* AUTHENTICATED VIEW */
                                    <div className="space-y-4">
                                        {/* User Details Card */}
                                        <div className="flex items-center space-x-4 bg-white/5 border border-white/5 p-4 rounded-2xl">
                                            <div className="w-12 h-12 rounded-full border border-white/10 overflow-hidden shrink-0 bg-zinc-800 flex items-center justify-center">
                                                {user.photoURL ? (
                                                    <img 
                                                        src={user.photoURL} 
                                                        alt={user.displayName || "Avatar"} 
                                                        className="w-full h-full object-cover"
                                                        referrerPolicy="no-referrer"
                                                    />
                                                ) : (
                                                    <UserIcon className="w-5 h-5 text-white/40" />
                                                )}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <h4 className="text-sm font-black text-white truncate">
                                                    {user.displayName || "Anime Watcher"}
                                                </h4>
                                                <p className="text-xxs text-foreground/45 truncate">
                                                    {user.email}
                                                </p>
                                                <div className="flex items-center space-x-1 mt-1 text-emerald-400 font-bold text-[9px] uppercase tracking-wider select-none">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                                                    <span>Cloud Connected</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Cloud Sync Data Stats Section */}
                                        <div className="bg-white/5 border border-white/5 rounded-2xl p-4 space-y-3">
                                            <div className="flex items-center justify-between text-xs select-none">
                                                <span className="text-foreground/60 font-semibold uppercase tracking-wider text-[10px]">Cloud Sync Stats</span>
                                                {loadingCounts ? (
                                                    <span className="text-foreground/40 text-[10px] animate-pulse">Checking database...</span>
                                                ) : (
                                                    <span className="text-emerald-400 font-bold text-[10px] uppercase">Active</span>
                                                )}
                                            </div>
                                            
                                            <div className="grid grid-cols-3 gap-2 text-center text-xs">
                                                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-2 select-none">
                                                    <span className="block text-[9px] text-foreground/45 uppercase tracking-wider">Watchlist</span>
                                                    <span className="block text-sm font-bold text-white mt-0.5">
                                                        {loadingCounts ? "..." : counts.watchlist}
                                                    </span>
                                                </div>
                                                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-2 select-none">
                                                    <span className="block text-[9px] text-foreground/45 uppercase tracking-wider">History</span>
                                                    <span className="block text-sm font-bold text-white mt-0.5">
                                                        {loadingCounts ? "..." : counts.history}
                                                    </span>
                                                </div>
                                                <div className="bg-white/[0.02] border border-white/5 rounded-xl p-2 select-none">
                                                    <span className="block text-[9px] text-foreground/45 uppercase tracking-wider">Episodes</span>
                                                    <span className="block text-sm font-bold text-white mt-0.5">
                                                        {loadingCounts ? "..." : counts.episodes}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Sync feedback */}
                                        {syncMessage && (
                                            <div className="flex items-center space-x-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-400 font-medium animate-pulse">
                                                <CheckCircle2 className="w-4 h-4 shrink-0" />
                                                <span>{syncMessage}</span>
                                            </div>
                                        )}

                                        {/* Control Buttons */}
                                        <div className="flex gap-3">
                                            <button
                                                onClick={handleSync}
                                                disabled={isSyncing}
                                                className="flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-white font-bold text-xs uppercase tracking-wider transition-colors disabled:opacity-50 cursor-pointer select-none"
                                            >
                                                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                                                <span>{isSyncing ? "Syncing..." : "Sync Now"}</span>
                                            </button>

                                            <button
                                                onClick={handleLogout}
                                                className="flex-1 flex items-center justify-center space-x-2 py-3 px-4 rounded-xl border border-red-500/20 hover:border-red-500/40 bg-red-500/5 hover:bg-red-500/10 text-red-400 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer select-none"
                                            >
                                                <LogOut className="w-3.5 h-3.5" />
                                                <span>Sign Out</span>
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Divider & Reset Actions */}
                                <div className="border-t border-white/5 pt-4 flex flex-col sm:flex-row items-center justify-center gap-4 text-center select-none w-full">
                                    <button
                                        onClick={() => setShowResetConfirm(true)}
                                        className="text-xxs font-bold uppercase tracking-wider text-foreground/45 hover:text-red-400 transition-colors cursor-pointer"
                                    >
                                        Reset Local Data
                                    </button>
                                    {user && (
                                        <>
                                            <span className="hidden sm:inline text-white/10">|</span>
                                            <button
                                                onClick={() => setShowDeleteCloudConfirm(true)}
                                                className="text-xxs font-bold uppercase tracking-wider text-foreground/45 hover:text-red-400 transition-colors cursor-pointer"
                                            >
                                                Delete Cloud Data
                                            </button>
                                        </>
                                    )}
                                </div>
                            </>
                        )}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
