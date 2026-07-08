"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { localStore, WatchlistItem, HistoryItem } from "@/lib/storage";
import { 
  X, 
  ShieldAlert, 
  Trash2, 
  LogOut, 
  RefreshCw, 
  Cloud, 
  User as UserIcon,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  Check
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
    const { user, loginWithGoogle, logout, triggerSync } = useAuth();
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [showManageCloud, setShowManageCloud] = useState(false);
    
    const [isSyncing, setIsSyncing] = useState(false);
    const [isDeletingCloud, setIsDeletingCloud] = useState(false);
    const [syncMessage, setSyncMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");

    // Cloud Data Lists and Statistics
    const [counts, setCounts] = useState({ watchlist: 0, history: 0, episodes: 0 });
    const [cloudWatchlist, setCloudWatchlist] = useState<WatchlistItem[]>([]);
    const [cloudHistory, setCloudHistory] = useState<HistoryItem[]>([]);
    const [loadingCounts, setLoadingCounts] = useState(false);

    // Tab Management inside Cloud Manager
    const [activeTab, setActiveTab] = useState<"watchlist" | "history">("watchlist");
    const [selectedItems, setSelectedItems] = useState<string[]>([]); // Array of detailPath

    // Fetch cloud sync list items and update counts
    const fetchCloudData = async (uid: string) => {
        setLoadingCounts(true);
        try {
            const { db } = await import("@/lib/firebase");
            const { collection, getDocs } = await import("firebase/firestore");
            
            const [watchlistSnap, historySnap, episodesSnap] = await Promise.all([
                getDocs(collection(db, "users", uid, "watchlist")),
                getDocs(collection(db, "users", uid, "history")),
                getDocs(collection(db, "users", uid, "watched_episodes"))
            ]);

            const wlItems: WatchlistItem[] = [];
            watchlistSnap.forEach((doc) => wlItems.push(doc.data() as WatchlistItem));

            const histItems: HistoryItem[] = [];
            historySnap.forEach((doc) => histItems.push(doc.data() as HistoryItem));
            // Sort history by updatedAt descending
            histItems.sort((a, b) => b.updatedAt - a.updatedAt);

            setCloudWatchlist(wlItems);
            setCloudHistory(histItems);
            setCounts({
                watchlist: wlItems.length,
                history: histItems.length,
                episodes: episodesSnap.size
            });
        } catch (err) {
            console.error("[profile] Failed to fetch cloud sync list items:", err);
        } finally {
            setLoadingCounts(false);
        }
    };

    // Load cloud lists when opening modal or logging in
    useEffect(() => {
        if (isOpen && user) {
            fetchCloudData(user.uid);
        } else if (!user) {
            setCloudWatchlist([]);
            setCloudHistory([]);
            setCounts({ watchlist: 0, history: 0, episodes: 0 });
        }
    }, [isOpen, user]);

    // Clear item selections when switching tabs
    useEffect(() => {
        setSelectedItems([]);
    }, [activeTab]);

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
            await fetchCloudData(user.uid); // Refresh cloud data state after sync
            setTimeout(() => setSyncMessage(""), 4000);
        } catch (err: any) {
            setErrorMessage("Failed to synchronize data.");
        } finally {
            setIsSyncing(false);
        }
    };

    // Toggle single item selection
    const toggleItemSelection = (path: string) => {
        setSelectedItems((prev) =>
            prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
        );
    };

    // Select all items in the current active tab list
    const toggleSelectAll = () => {
        const currentList = activeTab === "watchlist" ? cloudWatchlist : cloudHistory;
        if (selectedItems.length === currentList.length) {
            setSelectedItems([]);
        } else {
            setSelectedItems(currentList.map((item) => item.detailPath));
        }
    };

    // Delete selected items from both Cloud Firestore and local storage
    const handleDeleteSelected = async () => {
        if (!user || selectedItems.length === 0) return;
        setIsDeletingCloud(true);
        setErrorMessage("");
        try {
            const { db } = await import("@/lib/firebase");
            const { doc, deleteDoc, writeBatch } = await import("firebase/firestore");
            const batch = writeBatch(db);
            const pathsToDelete = [...selectedItems];

            if (activeTab === "watchlist") {
                // Delete from Cloud
                pathsToDelete.forEach((path) => {
                    const docRef = doc(db, "users", user.uid, "watchlist", encodeURIComponent(path));
                    batch.delete(docRef);
                });
                await batch.commit();

                // Delete from local storage (keep sync state identical)
                const localWatchlist = localStore.getWatchlist();
                const updatedLocal = localWatchlist.filter((item) => !pathsToDelete.includes(item.detailPath));
                localStorage.setItem("kixo_watchlist", JSON.stringify(updatedLocal));

                // Update UI state
                const updatedCloud = cloudWatchlist.filter((item) => !pathsToDelete.includes(item.detailPath));
                setCloudWatchlist(updatedCloud);
                setCounts((prev) => ({ ...prev, watchlist: updatedCloud.length }));
            } else {
                // Delete from Cloud
                pathsToDelete.forEach((path) => {
                    const docRef = doc(db, "users", user.uid, "history", encodeURIComponent(path));
                    batch.delete(docRef);
                });
                await batch.commit();

                // Delete from local storage
                const localHistory = localStore.getHistory();
                const updatedLocal = localHistory.filter((item) => !pathsToDelete.includes(item.detailPath));
                localStorage.setItem("kixo_history", JSON.stringify(updatedLocal));

                // Update UI state
                const updatedCloud = cloudHistory.filter((item) => !pathsToDelete.includes(item.detailPath));
                setCloudHistory(updatedCloud);
                setCounts((prev) => ({ ...prev, history: updatedCloud.length }));
            }

            setSelectedItems([]);
            setSyncMessage(`Deleted ${pathsToDelete.length} item(s) successfully.`);
            setTimeout(() => setSyncMessage(""), 4000);
        } catch (err: any) {
            console.error("[profile] Failed to delete selected items:", err);
            setErrorMessage("Failed to delete selected items.");
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
                        ) : showManageCloud ? (
                            /* MANAGE CLOUD DATA VIEW WITH SELECTION CARD LISTS */
                            <div className="space-y-4">
                                {/* Header with back arrow */}
                                <div className="flex items-center space-x-3">
                                    <button
                                        onClick={() => setShowManageCloud(false)}
                                        className="p-1.5 rounded-xl border border-glass-border bg-glass-card hover:bg-glass-panel text-white transition-all cursor-pointer"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                    </button>
                                    <div>
                                        <h3 className="text-sm font-black text-white uppercase tracking-wider leading-none">
                                            Manage Cloud Data
                                        </h3>
                                        <span className="text-[10px] text-foreground/45">
                                            Select items to delete from database sync
                                        </span>
                                    </div>
                                </div>

                                {/* Tab Selector */}
                                <div className="flex border-b border-white/5 text-xs">
                                    <button
                                        onClick={() => setActiveTab("watchlist")}
                                        className={`flex-1 pb-2 font-bold uppercase tracking-wider transition-colors cursor-pointer text-[10px] ${
                                            activeTab === "watchlist"
                                                ? "text-primary border-b-2 border-primary"
                                                : "text-foreground/45 hover:text-white"
                                        }`}
                                    >
                                        Watchlist ({counts.watchlist})
                                    </button>
                                    <button
                                        onClick={() => setActiveTab("history")}
                                        className={`flex-1 pb-2 font-bold uppercase tracking-wider transition-colors cursor-pointer text-[10px] ${
                                            activeTab === "history"
                                                ? "text-primary border-b-2 border-primary"
                                                : "text-foreground/45 hover:text-white"
                                        }`}
                                    >
                                        History ({counts.history})
                                    </button>
                                </div>

                                {/* Checkbox Controls Bar */}
                                <div className="flex items-center justify-between text-xxs px-1 text-foreground/60 select-none">
                                    <button
                                        onClick={toggleSelectAll}
                                        className="hover:text-white font-bold transition-colors cursor-pointer"
                                    >
                                        {selectedItems.length === (activeTab === "watchlist" ? cloudWatchlist.length : cloudHistory.length) && (activeTab === "watchlist" ? cloudWatchlist.length : cloudHistory.length) > 0
                                            ? "Deselect All"
                                            : "Select All"}
                                    </button>
                                    <span>{selectedItems.length} item(s) selected</span>
                                </div>

                                {/* Card List Container */}
                                <div className="max-h-64 overflow-y-auto pr-1 space-y-2 custom-scrollbar">
                                    {activeTab === "watchlist" ? (
                                        cloudWatchlist.length === 0 ? (
                                            <div className="py-8 text-center text-xs text-foreground/40 font-medium">
                                                No bookmarks synced in the cloud.
                                            </div>
                                        ) : (
                                            cloudWatchlist.map((item) => (
                                                <div
                                                    key={item.detailPath}
                                                    onClick={() => toggleItemSelection(item.detailPath)}
                                                    className="flex items-center space-x-3 bg-white/[0.02] border border-white/5 hover:bg-white/5 rounded-2xl p-2 cursor-pointer transition-all duration-200"
                                                >
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                                        selectedItems.includes(item.detailPath)
                                                            ? "bg-primary border-primary text-white"
                                                            : "border-white/20 bg-zinc-900"
                                                    }`}>
                                                        {selectedItems.includes(item.detailPath) && (
                                                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                                                        )}
                                                    </div>
                                                    <img
                                                        src={item.coverUrl}
                                                        alt={item.title}
                                                        className="w-8 h-11 object-cover rounded-lg shrink-0 bg-zinc-900"
                                                    />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-xs font-black text-white truncate">
                                                            {item.title}
                                                        </p>
                                                        <span className="text-[9px] font-bold text-foreground/45 uppercase tracking-wider block mt-0.5">
                                                            {item.corner || "Movie / Series"}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))
                                        )
                                    ) : (
                                        cloudHistory.length === 0 ? (
                                            <div className="py-8 text-center text-xs text-foreground/40 font-medium">
                                                No watch history synced in the cloud.
                                            </div>
                                        ) : (
                                            cloudHistory.map((item) => (
                                                <div
                                                    key={item.detailPath}
                                                    onClick={() => toggleItemSelection(item.detailPath)}
                                                    className="flex items-center space-x-3 bg-white/[0.02] border border-white/5 hover:bg-white/5 rounded-2xl p-2 cursor-pointer transition-all duration-200"
                                                >
                                                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                                        selectedItems.includes(item.detailPath)
                                                            ? "bg-primary border-primary text-white"
                                                            : "border-white/20 bg-zinc-900"
                                                    }`}>
                                                        {selectedItems.includes(item.detailPath) && (
                                                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                                                        )}
                                                    </div>
                                                    <img
                                                        src={item.coverUrl}
                                                        alt={item.title}
                                                        className="w-8 h-11 object-cover rounded-lg shrink-0 bg-zinc-900"
                                                    />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-xs font-black text-white truncate">
                                                            {item.title}
                                                        </p>
                                                        <div className="flex items-center space-x-2 mt-0.5">
                                                            <span className="text-[9px] font-bold text-foreground/45 uppercase tracking-wider">
                                                                {item.isSeries ? `S${item.season} E${item.episode}` : "Movie"}
                                                            </span>
                                                            <span className="text-[9px] font-bold text-primary tracking-wider uppercase">
                                                                {Math.round(item.progress)}% Watched
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))
                                        )
                                    )}
                                </div>

                                {/* Action Buttons */}
                                <div className="flex gap-3 pt-2">
                                    <button
                                        onClick={() => setShowManageCloud(false)}
                                        className="flex-1 py-3 px-4 rounded-xl border border-glass-border text-foreground/75 hover:text-white hover:bg-white/5 transition-colors text-xs font-bold uppercase tracking-wider cursor-pointer select-none"
                                        disabled={isDeletingCloud}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleDeleteSelected}
                                        disabled={selectedItems.length === 0 || isDeletingCloud}
                                        className="flex-1 py-3 px-4 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center space-x-1.5 cursor-pointer select-none"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        <span>
                                            {isDeletingCloud 
                                                ? "Deleting..." 
                                                : `Delete Selected (${selectedItems.length})`}
                                        </span>
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
                                                onClick={() => setShowManageCloud(true)}
                                                className="text-xxs font-bold uppercase tracking-wider text-foreground/45 hover:text-red-400 transition-colors cursor-pointer"
                                            >
                                                Manage Cloud Data
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
