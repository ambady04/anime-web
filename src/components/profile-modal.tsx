"use client";

import { useState, useEffect, useRef } from "react";
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
    Check,
    Download,
    Upload,
    Sliders,
    Database,
    ArrowDownCircle,
    ArrowUpCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
    const { user, loginWithGoogle, logout, triggerSync } = useAuth();

    // UI states
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [showDeleteCloudConfirm, setShowDeleteCloudConfirm] = useState(false);
    const [activeRightTab, setActiveRightTab] = useState<
        "manager" | "forceOps" | "preferences"
    >("manager");

    const [isSyncing, setIsSyncing] = useState(false);
    const [isDeletingCloud, setIsDeletingCloud] = useState(false);
    const [isForcePushing, setIsForcePushing] = useState(false);
    const [isForcePulling, setIsForcePulling] = useState(false);

    const [syncMessage, setSyncMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState("");

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Cloud Data Lists and Statistics
    const [counts, setCounts] = useState({
        watchlist: 0,
        history: 0,
        episodes: 0,
    });
    const [cloudWatchlist, setCloudWatchlist] = useState<WatchlistItem[]>([]);
    const [cloudHistory, setCloudHistory] = useState<HistoryItem[]>([]);
    const [loadingCounts, setLoadingCounts] = useState(false);

    // Tab Management inside Cloud Manager
    const [managerTab, setManagerTab] = useState<"watchlist" | "history">(
        "watchlist",
    );
    const [selectedItems, setSelectedItems] = useState<string[]>([]); // Array of detailPath

    // Local Preferences State
    const [prefTheme, setPrefTheme] = useState("dark");
    const [prefSubtitleSize, setPrefSubtitleSize] = useState("22px");
    const [prefAutoplay, setPrefAutoplay] = useState(true);
    const [prefAutoResume, setPrefAutoResume] = useState(true);

    // Fetch cloud sync list items and update counts
    const fetchCloudData = async (uid: string) => {
        setLoadingCounts(true);
        try {
            const { ensureFirebase, getFirebaseDb } =
                await import("@/lib/firebase");
            await ensureFirebase();
            const db = getFirebaseDb();
            const { collection, getDocs } = await import("firebase/firestore");

            const [watchlistSnap, historySnap, episodesSnap] =
                await Promise.all([
                    getDocs(collection(db, "users", uid, "watchlist")),
                    getDocs(collection(db, "users", uid, "history")),
                    getDocs(collection(db, "users", uid, "watched_episodes")),
                ]);

            const wlItems: WatchlistItem[] = [];
            watchlistSnap.forEach((doc) =>
                wlItems.push(doc.data() as WatchlistItem),
            );

            const histItems: HistoryItem[] = [];
            historySnap.forEach((doc) =>
                histItems.push(doc.data() as HistoryItem),
            );
            histItems.sort((a, b) => b.updatedAt - a.updatedAt);

            // Deduplicate cloud history by base title to group series-wise
            const seenHist = new Set<string>();
            const cleanHist: HistoryItem[] = [];
            for (const item of histItems) {
                const baseTitle = item.title
                    .replace(/\[[^\]]+\]/g, "")
                    .trim()
                    .toLowerCase();
                if (!seenHist.has(baseTitle)) {
                    seenHist.add(baseTitle);
                    cleanHist.push(item);
                }
            }

            setCloudWatchlist(wlItems);
            setCloudHistory(cleanHist);
            setCounts({
                watchlist: wlItems.length,
                history: cleanHist.length,
                episodes: episodesSnap.size,
            });
        } catch (err) {
            console.error(
                "[profile] Failed to fetch cloud sync list items:",
                err,
            );
        } finally {
            setLoadingCounts(false);
        }
    };

    // Load data and configurations when modal is displayed
    useEffect(() => {
        if (isOpen) {
            if (user) {
                fetchCloudData(user.uid);
            }
            // Load local preferences
            setPrefTheme(localStorage.getItem("kixo_theme") || "dark");
            setPrefSubtitleSize(
                localStorage.getItem("player-subtitle-size") || "22px",
            );
            setPrefAutoplay(
                localStorage.getItem("player-autoplay") !== "false",
            );
            setPrefAutoResume(
                localStorage.getItem("player-auto-resume") !== "false",
            );
        } else {
            setCloudWatchlist([]);
            setCloudHistory([]);
            setCounts({ watchlist: 0, history: 0, episodes: 0 });
            setShowResetConfirm(false);
            setShowDeleteCloudConfirm(false);
            setSelectedItems([]);
        }
    }, [isOpen, user]);

    // Reset selection when sub-tab changes
    useEffect(() => {
        setSelectedItems([]);
    }, [managerTab]);

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
            await fetchCloudData(user.uid); // Refresh counts
            setTimeout(() => setSyncMessage(""), 4000);
        } catch (err: any) {
            setErrorMessage("Failed to synchronize data.");
        } finally {
            setIsSyncing(false);
        }
    };

    // Export Watchlist/History/Episodes/Settings to JSON file
    const handleExportBackup = () => {
        try {
            const backup: Record<string, any> = {
                version: "1.0",
                timestamp: Date.now(),
                watchlist: localStore.getWatchlist(),
                history: localStore.getHistory(),
                episodes: {},
                settings: {
                    theme: localStorage.getItem("kixo_theme") || "dark",
                    subtitleSize:
                        localStorage.getItem("player-subtitle-size") || "22px",
                    autoplay: localStorage.getItem("player-autoplay") || "true",
                    autoResume:
                        localStorage.getItem("player-auto-resume") || "true",
                },
            };

            // Capture episode checkmarks
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith("kixo_ep__")) {
                    const val = localStorage.getItem(key);
                    if (val) backup.episodes[key] = JSON.parse(val);
                }
            }

            const jsonStr = JSON.stringify(backup, null, 2);
            const blob = new Blob([jsonStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);

            const link = document.createElement("a");
            link.href = url;
            link.download = `kixo_backup_${new Date().toISOString().slice(0, 10)}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            setSyncMessage("Data exported successfully!");
            setTimeout(() => setSyncMessage(""), 3000);
        } catch (err) {
            setErrorMessage("Failed to export browser backup data.");
        }
    };

    // Import from JSON backup file
    const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
        const fileReader = new FileReader();
        const files = e.target.files;
        if (!files || files.length === 0) return;

        fileReader.onload = async (event) => {
            try {
                const backup = JSON.parse(event.target?.result as string);
                if (!backup || typeof backup !== "object")
                    throw new Error("Invalid format");

                // Restores watchlist
                if (Array.isArray(backup.watchlist)) {
                    localStorage.setItem(
                        "kixo_watchlist",
                        JSON.stringify(backup.watchlist),
                    );
                }

                // Restores history
                if (Array.isArray(backup.history)) {
                    localStorage.setItem(
                        "kixo_history",
                        JSON.stringify(backup.history),
                    );
                }

                // Restores watched episodes checklists
                if (backup.episodes && typeof backup.episodes === "object") {
                    Object.entries(backup.episodes).forEach(([key, val]) => {
                        if (key.startsWith("kixo_ep__") && Array.isArray(val)) {
                            localStorage.setItem(key, JSON.stringify(val));
                        }
                    });
                }

                // Restores player preferences
                if (backup.settings && typeof backup.settings === "object") {
                    if (backup.settings.theme) {
                        localStorage.setItem(
                            "kixo_theme",
                            backup.settings.theme,
                        );
                        updatePrefTheme(backup.settings.theme);
                    }
                    if (backup.settings.subtitleSize) {
                        localStorage.setItem(
                            "player-subtitle-size",
                            backup.settings.subtitleSize,
                        );
                        setPrefSubtitleSize(backup.settings.subtitleSize);
                    }
                    if (backup.settings.autoplay) {
                        localStorage.setItem(
                            "player-autoplay",
                            backup.settings.autoplay,
                        );
                        setPrefAutoplay(backup.settings.autoplay === "true");
                    }
                    if (backup.settings.autoResume) {
                        localStorage.setItem(
                            "player-auto-resume",
                            backup.settings.autoResume,
                        );
                        setPrefAutoResume(
                            backup.settings.autoResume === "true",
                        );
                    }
                }

                setSyncMessage(
                    "Data successfully imported! Syncing with cloud...",
                );

                if (user) {
                    setIsSyncing(true);
                    await triggerSync();
                    await fetchCloudData(user.uid);
                    setIsSyncing(false);
                }

                setTimeout(() => {
                    setSyncMessage("");
                    window.location.reload();
                }, 1500);
            } catch (err) {
                setErrorMessage("Invalid backup file layout.");
            }
        };
        fileReader.readAsText(files[0]);
    };

    // Advanced Sync Ops: Force push local browser cache directly overwriting Firestore
    const handleForcePush = async () => {
        if (!user) return;
        setIsForcePushing(true);
        setErrorMessage("");
        try {
            const { ensureFirebase, getFirebaseDb } =
                await import("@/lib/firebase");
            await ensureFirebase();
            const db = getFirebaseDb();
            const { collection, getDocs, doc, writeBatch } =
                await import("firebase/firestore");
            const uid = user.uid;

            // Step 1: Wipe remote database
            const [watchlistSnap, historySnap, episodesSnap] =
                await Promise.all([
                    getDocs(collection(db, "users", uid, "watchlist")),
                    getDocs(collection(db, "users", uid, "history")),
                    getDocs(collection(db, "users", uid, "watched_episodes")),
                ]);

            const clearBatch = writeBatch(db);
            watchlistSnap.forEach((doc: any) => clearBatch.delete(doc.ref));
            historySnap.forEach((doc: any) => clearBatch.delete(doc.ref));
            episodesSnap.forEach((doc: any) => clearBatch.delete(doc.ref));
            await clearBatch.commit();

            // Step 2: Upload local storage data
            const uploadBatch = writeBatch(db);
            const localWatchlist = localStore.getWatchlist();
            localWatchlist.forEach((item) => {
                const docRef = doc(
                    db,
                    "users",
                    uid,
                    "watchlist",
                    encodeURIComponent(item.detailPath),
                );
                uploadBatch.set(docRef, item);
            });

            const localHistory = localStore.getHistory();
            localHistory.forEach((item) => {
                const docRef = doc(
                    db,
                    "users",
                    uid,
                    "history",
                    encodeURIComponent(item.detailPath),
                );
                uploadBatch.set(docRef, item);
            });

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith("kixo_ep__")) {
                    const cleanKey = key.replace("kixo_ep__", "");
                    const data = localStorage.getItem(key);
                    if (data) {
                        const docRef = doc(
                            db,
                            "users",
                            uid,
                            "watched_episodes",
                            encodeURIComponent(cleanKey),
                        );
                        uploadBatch.set(docRef, {
                            episodes: JSON.parse(data),
                            updatedAt: Date.now(),
                        });
                    }
                }
            }

            await uploadBatch.commit();
            await fetchCloudData(uid);
            setSyncMessage(
                "Local state forced to Cloud database successfully!",
            );
            setTimeout(() => setSyncMessage(""), 4000);
        } catch (err) {
            console.error("[profile] Force push failed:", err);
            setErrorMessage("Conflict overwrite failed.");
        } finally {
            setIsForcePushing(false);
        }
    };

    // Advanced Sync Ops: Force download cloud database directly overwriting local storage keys
    const handleForcePull = async () => {
        if (!user) return;
        setIsForcePulling(true);
        setErrorMessage("");
        try {
            const { ensureFirebase, getFirebaseDb } =
                await import("@/lib/firebase");
            await ensureFirebase();
            const db = getFirebaseDb();
            const { collection, getDocs } = await import("firebase/firestore");
            const uid = user.uid;

            const [watchlistSnap, historySnap, episodesSnap] =
                await Promise.all([
                    getDocs(collection(db, "users", uid, "watchlist")),
                    getDocs(collection(db, "users", uid, "history")),
                    getDocs(collection(db, "users", uid, "watched_episodes")),
                ]);

            // Clear local stores
            localStorage.removeItem("kixo_watchlist");
            localStorage.removeItem("kixo_history");
            for (let i = localStorage.length - 1; i >= 0; i--) {
                const key = localStorage.key(i);
                if (key && key.startsWith("kixo_ep__"))
                    localStorage.removeItem(key);
            }

            // Restore from remote database documents
            const wlItems: WatchlistItem[] = [];
            watchlistSnap.forEach((doc) =>
                wlItems.push(doc.data() as WatchlistItem),
            );
            localStorage.setItem("kixo_watchlist", JSON.stringify(wlItems));

            const histItems: HistoryItem[] = [];
            historySnap.forEach((doc) =>
                histItems.push(doc.data() as HistoryItem),
            );
            histItems.sort((a, b) => b.updatedAt - a.updatedAt);
            localStorage.setItem("kixo_history", JSON.stringify(histItems));

            episodesSnap.forEach((doc) => {
                const key = `kixo_ep__${decodeURIComponent(doc.id)}`;
                const data = doc.data() as { episodes: number[] };
                localStorage.setItem(key, JSON.stringify(data.episodes));
            });

            await fetchCloudData(uid);
            setSyncMessage(
                "Cloud pulled successfully! Reloading to apply changes...",
            );
            setTimeout(() => {
                setSyncMessage("");
                window.location.reload();
            }, 1500);
        } catch (err) {
            console.error("[profile] Force pull failed:", err);
            setErrorMessage("Failed to pull database sync.");
        } finally {
            setIsForcePulling(false);
        }
    };

    // Preferences Modification Handlers
    const updatePrefTheme = (val: string) => {
        setPrefTheme(val);
        localStorage.setItem("kixo_theme", val);
        if (val === "light") {
            document.documentElement.classList.add("light");
        } else {
            document.documentElement.classList.remove("light");
        }
    };

    const updatePrefSubtitleSize = (val: string) => {
        setPrefSubtitleSize(val);
        localStorage.setItem("player-subtitle-size", val);
    };

    const updatePrefAutoplay = (val: boolean) => {
        setPrefAutoplay(val);
        localStorage.setItem("player-autoplay", val ? "true" : "false");
    };

    const updatePrefAutoResume = (val: boolean) => {
        setPrefAutoResume(val);
        localStorage.setItem("player-auto-resume", val ? "true" : "false");
    };

    // Toggle Selection for Lists
    const toggleItemSelection = (path: string) => {
        setSelectedItems((prev) =>
            prev.includes(path)
                ? prev.filter((p) => p !== path)
                : [...prev, path],
        );
    };

    const toggleSelectAll = () => {
        const currentList =
            managerTab === "watchlist" ? cloudWatchlist : cloudHistory;
        if (selectedItems.length === currentList.length) {
            setSelectedItems([]);
        } else {
            setSelectedItems(currentList.map((item) => item.detailPath));
        }
    };

    const handleDeleteSelected = async () => {
        if (!user || selectedItems.length === 0) return;
        setIsDeletingCloud(true);
        setErrorMessage("");
        try {
            const { ensureFirebase, getFirebaseDb } =
                await import("@/lib/firebase");
            await ensureFirebase();
            const db = getFirebaseDb();
            const { doc, writeBatch } = await import("firebase/firestore");
            const batch = writeBatch(db);
            const pathsToDelete = [...selectedItems];

            if (managerTab === "watchlist") {
                pathsToDelete.forEach((path) => {
                    const docRef = doc(
                        db,
                        "users",
                        user.uid,
                        "watchlist",
                        encodeURIComponent(path),
                    );
                    batch.delete(docRef);

                    // Clear episode progress from both local storage and Cloud Firestore database sync collections
                    for (let i = localStorage.length - 1; i >= 0; i--) {
                        const key = localStorage.key(i);
                        if (key && key.startsWith(`kixo_ep__${path}__s`)) {
                            localStorage.removeItem(key);
                            const cleanKey = key.replace("kixo_ep__", "");
                            const epDocRef = doc(
                                db,
                                "users",
                                user.uid,
                                "watched_episodes",
                                encodeURIComponent(cleanKey),
                            );
                            batch.delete(epDocRef);
                        }
                    }
                });
                await batch.commit();

                const updatedLocal = localStore
                    .getWatchlist()
                    .filter((item) => !pathsToDelete.includes(item.detailPath));
                localStorage.setItem(
                    "kixo_watchlist",
                    JSON.stringify(updatedLocal),
                );

                const updatedCloud = cloudWatchlist.filter(
                    (item) => !pathsToDelete.includes(item.detailPath),
                );
                setCloudWatchlist(updatedCloud);
                setCounts((prev) => ({
                    ...prev,
                    watchlist: updatedCloud.length,
                }));
            } else {
                pathsToDelete.forEach((path) => {
                    const docRef = doc(
                        db,
                        "users",
                        user.uid,
                        "history",
                        encodeURIComponent(path),
                    );
                    batch.delete(docRef);
                });
                await batch.commit();

                const updatedLocal = localStore
                    .getHistory()
                    .filter((item) => !pathsToDelete.includes(item.detailPath));
                localStorage.setItem(
                    "kixo_history",
                    JSON.stringify(updatedLocal),
                );

                const updatedCloud = cloudHistory.filter(
                    (item) => !pathsToDelete.includes(item.detailPath),
                );
                setCloudHistory(updatedCloud);
                setCounts((prev) => ({
                    ...prev,
                    history: updatedCloud.length,
                }));
            }

            setSelectedItems([]);
            setSyncMessage(
                `Deleted ${pathsToDelete.length} item(s) successfully.`,
            );
            setTimeout(() => setSyncMessage(""), 4000);
        } catch (err: any) {
            console.error("[profile] Batch delete failed:", err);
            setErrorMessage("Deletion failed.");
        } finally {
            setIsDeletingCloud(false);
        }
    };

    // Full Cloud Sync Deletion (Cloud Purge)
    const handleDeleteAllCloud = async () => {
        if (!user) return;
        setIsDeletingCloud(true);
        setErrorMessage("");
        try {
            const { ensureFirebase, getFirebaseDb } =
                await import("@/lib/firebase");
            await ensureFirebase();
            const db = getFirebaseDb();
            const { collection, getDocs, writeBatch } =
                await import("firebase/firestore");
            const uid = user.uid;

            const [watchlistSnap, historySnap, episodesSnap] =
                await Promise.all([
                    getDocs(collection(db, "users", uid, "watchlist")),
                    getDocs(collection(db, "users", uid, "history")),
                    getDocs(collection(db, "users", uid, "watched_episodes")),
                ]);

            const batch = writeBatch(db);
            watchlistSnap.forEach((doc: any) => batch.delete(doc.ref));
            historySnap.forEach((doc: any) => batch.delete(doc.ref));
            episodesSnap.forEach((doc: any) => batch.delete(doc.ref));

            await batch.commit();
            setCounts({ watchlist: 0, history: 0, episodes: 0 });
            setCloudWatchlist([]);
            setCloudHistory([]);
            setSyncMessage("All cloud synced data has been deleted.");
            setShowDeleteCloudConfirm(false);
            setTimeout(() => setSyncMessage(""), 4000);
        } catch (err) {
            setErrorMessage("Failed to delete all cloud data.");
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
                document.cookie =
                    name.trim() +
                    "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
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

                    {/* Widescreen Dashboard Panel */}
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        transition={{ type: "spring", duration: 0.4 }}
                        className="relative w-full max-w-3xl bg-zinc-950/95 backdrop-blur-md border border-white/10 p-6 rounded-3xl shadow-2xl z-10 flex flex-col md:flex-row gap-6 max-h-[90vh] md:max-h-[85vh] overflow-hidden"
                    >
                        {/* Close icon button */}
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 p-2 rounded-xl text-foreground/50 hover:text-white hover:bg-white/5 transition-colors focus:outline-none cursor-pointer z-20"
                        >
                            <X className="w-4 h-4" />
                        </button>

                        {/* Confirmation Views Interception */}
                        {showResetConfirm ? (
                            /* RESET LOCAL VIEW */
                            <div className="space-y-6 flex-1 py-4">
                                <div className="flex flex-col items-center text-center space-y-3 select-none">
                                    <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-lg shadow-primary-glow/10 animate-bounce">
                                        <ShieldAlert className="w-6 h-6" />
                                    </div>
                                    <h3 className="text-lg font-black text-white uppercase tracking-wider">
                                        Reset Application Data
                                    </h3>
                                    <p className="text-xs text-foreground/60 font-medium max-w-xs leading-relaxed">
                                        This resets your local browser data. If
                                        you are logged in, your cloud sync
                                        backups will be preserved.
                                    </p>
                                </div>
                                <div className="bg-white/5 border border-white/5 rounded-2xl p-4 space-y-3 text-xs max-w-md mx-auto">
                                    <div className="flex items-center justify-between text-white/80">
                                        <span className="font-semibold">
                                            Local Watchlist / Bookmarks
                                        </span>
                                        <span className="text-primary font-bold">
                                            Will be cleared
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-white/80 border-t border-white/5 pt-3">
                                        <span className="font-semibold">
                                            Local Playback History
                                        </span>
                                        <span className="text-primary font-bold">
                                            Will be cleared
                                        </span>
                                    </div>
                                </div>
                                <div className="flex gap-3 max-w-md mx-auto">
                                    <button
                                        onClick={() =>
                                            setShowResetConfirm(false)
                                        }
                                        className="flex-1 py-3 rounded-xl border border-glass-border text-foreground/75 hover:text-white hover:bg-white/5 transition-colors text-xs font-bold uppercase tracking-wider cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleResetData}
                                        className="flex-1 py-3 rounded-xl bg-primary hover:bg-primary-light text-white text-xs font-bold uppercase tracking-wider shadow-lg shadow-primary-glow cursor-pointer flex items-center justify-center space-x-1.5"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        <span>Reset App</span>
                                    </button>
                                </div>
                            </div>
                        ) : showDeleteCloudConfirm ? (
                            /* FULL CLOUD PURGE VIEW */
                            <div className="space-y-6 flex-1 py-4">
                                <div className="flex flex-col items-center text-center space-y-3 select-none">
                                    <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 shadow-lg shadow-red-glow/10 animate-pulse">
                                        <ShieldAlert className="w-6 h-6" />
                                    </div>
                                    <h3 className="text-lg font-black text-white uppercase tracking-wider">
                                        Purge Cloud Synchronization
                                    </h3>
                                    <p className="text-xs text-foreground/60 font-medium max-w-xs leading-relaxed">
                                        This completely deletes all data
                                        (Watchlist, History, Episodes) synced
                                        with your Google account. Your local
                                        device states will not be deleted.
                                    </p>
                                </div>
                                <div className="bg-white/5 border border-white/5 rounded-2xl p-4 space-y-3 text-xs max-w-md mx-auto">
                                    <div className="flex items-center justify-between text-white/80">
                                        <span className="font-semibold">
                                            Cloud Watchlist / Bookmarks
                                        </span>
                                        <span className="text-red-500 font-bold">
                                            Deleted Forever
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-white/80 border-t border-white/5 pt-3">
                                        <span className="font-semibold">
                                            Cloud Playback Progress
                                        </span>
                                        <span className="text-red-500 font-bold">
                                            Deleted Forever
                                        </span>
                                    </div>
                                </div>
                                <div className="flex gap-3 max-w-md mx-auto">
                                    <button
                                        onClick={() =>
                                            setShowDeleteCloudConfirm(false)
                                        }
                                        className="flex-1 py-3 rounded-xl border border-glass-border text-foreground/75 hover:text-white hover:bg-white/5 transition-colors text-xs font-bold uppercase tracking-wider cursor-pointer"
                                        disabled={isDeletingCloud}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleDeleteAllCloud}
                                        disabled={isDeletingCloud}
                                        className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold uppercase tracking-wider shadow-lg shadow-red-glow cursor-pointer flex items-center justify-center space-x-1.5 disabled:opacity-50"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                        <span>Confirm Purge</span>
                                    </button>
                                </div>
                            </div>
                        ) : (
                            /* WIDESCREEN DOUBLE-PANE VIEW */
                            <>
                                {/* LEFT SIDEBAR: Account Details & Local Backups */}
                                <div className="w-full md:w-64 shrink-0 flex flex-col justify-between border-b md:border-b-0 md:border-r border-white/10 pb-6 md:pb-0 md:pr-6 overflow-y-auto pr-1">
                                    <div className="space-y-5">
                                        {/* User Details */}
                                        {!user ? (
                                            /* GUEST CARD */
                                            <div className="space-y-4 pt-2">
                                                <div className="flex items-center space-x-3 select-none">
                                                    <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-foreground/60">
                                                        <UserIcon className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-black text-white">
                                                            Guest Account
                                                        </h4>
                                                        <span className="text-[10px] text-foreground/45 block">
                                                            Not signed in
                                                        </span>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={handleGoogleLogin}
                                                    className="w-full flex items-center justify-center space-x-2.5 py-2.5 px-4 rounded-xl bg-white text-zinc-950 hover:bg-zinc-100 font-bold text-xs uppercase tracking-wider transition-all shadow-md shadow-white/5 cursor-pointer"
                                                >
                                                    <svg
                                                        className="w-3.5 h-3.5"
                                                        viewBox="0 0 24 24"
                                                    >
                                                        <path
                                                            fill="#EA4335"
                                                            d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114-3.535 0-6.4-2.865-6.4-6.4s2.865-6.4 6.4-6.4c1.558 0 2.977.562 4.092 1.488l3.078-3.078C19.123 2.215 15.86 1 12 1 5.925 1 1 5.925 1 12s4.925 11 11 11c6.545 0 11.23-4.596 11.23-11.23 0-.64-.076-1.127-.174-1.485H12.24Z"
                                                        />
                                                    </svg>
                                                    <span>
                                                        Sign In with Google
                                                    </span>
                                                </button>
                                            </div>
                                        ) : (
                                            /* AUTHENTICATED USER CARD */
                                            <div className="space-y-3">
                                                <div className="flex items-center space-x-3 bg-white/5 border border-white/5 p-3 rounded-2xl">
                                                    <div className="w-10 h-10 rounded-full border border-white/15 overflow-hidden shrink-0 bg-zinc-800 flex items-center justify-center">
                                                        {user.photoURL ? (
                                                            <img
                                                                src={
                                                                    user.photoURL
                                                                }
                                                                alt={
                                                                    user.displayName ||
                                                                    "Avatar"
                                                                }
                                                                className="w-full h-full object-cover"
                                                                referrerPolicy="no-referrer"
                                                            />
                                                        ) : (
                                                            <UserIcon className="w-4 h-4 text-white/40" />
                                                        )}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <h4 className="text-xs font-black text-white truncate">
                                                            {user.displayName ||
                                                                "Anime Watcher"}
                                                        </h4>
                                                        <p className="text-[10px] text-foreground/45 truncate">
                                                            {user.email}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={handleSync}
                                                        disabled={isSyncing}
                                                        className="flex-1 flex items-center justify-center space-x-1.5 py-2 px-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-white font-bold text-[10px] uppercase tracking-wider transition-colors disabled:opacity-50 cursor-pointer"
                                                    >
                                                        <RefreshCw
                                                            className={`w-3 h-3 ${isSyncing ? "animate-spin" : ""}`}
                                                        />
                                                        <span>
                                                            {isSyncing
                                                                ? "Syncing"
                                                                : "Sync Now"}
                                                        </span>
                                                    </button>
                                                    <button
                                                        onClick={handleLogout}
                                                        className="py-2 px-3 rounded-xl border border-red-500/20 hover:border-red-500/40 bg-red-500/5 hover:bg-red-500/10 text-red-400 font-bold text-[10px] uppercase tracking-wider transition-all cursor-pointer"
                                                    >
                                                        <LogOut className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Feedback Notification */}
                                        {syncMessage && (
                                            <div className="flex items-center space-x-1.5 p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[10px] text-emerald-400 font-medium">
                                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                                <span className="truncate">
                                                    {syncMessage}
                                                </span>
                                            </div>
                                        )}
                                        {errorMessage && (
                                            <div className="flex items-center space-x-1.5 p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-[10px] text-red-400 font-medium">
                                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                                <span className="truncate">
                                                    {errorMessage}
                                                </span>
                                            </div>
                                        )}

                                        {/* Backups Panel */}
                                        <div className="bg-white/5 border border-white/5 rounded-2xl p-3.5 space-y-3">
                                            <div>
                                                <span className="text-[10px] font-bold text-white uppercase tracking-wider block">
                                                    Local Backups
                                                </span>
                                                <span className="text-[9px] text-foreground/45 block mt-0.5">
                                                    Export or restore browser
                                                    files
                                                </span>
                                            </div>
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={handleExportBackup}
                                                    className="flex-1 flex items-center justify-center space-x-1 py-2 px-3 rounded-xl bg-white/2 border border-white/5 hover:bg-white/5 hover:border-white/10 text-white font-bold text-[10px] uppercase tracking-wider cursor-pointer"
                                                >
                                                    <Download className="w-3 h-3 text-foreground/60" />
                                                    <span>Export</span>
                                                </button>
                                                <button
                                                    onClick={() =>
                                                        fileInputRef.current?.click()
                                                    }
                                                    className="flex-1 flex items-center justify-center space-x-1 py-2 px-3 rounded-xl bg-white/2 border border-white/5 hover:bg-white/5 hover:border-white/10 text-white font-bold text-[10px] uppercase tracking-wider cursor-pointer"
                                                >
                                                    <Upload className="w-3 h-3 text-foreground/60" />
                                                    <span>Import</span>
                                                </button>
                                                <input
                                                    type="file"
                                                    ref={fileInputRef}
                                                    onChange={
                                                        handleImportBackup
                                                    }
                                                    className="hidden"
                                                    accept=".json"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Footer Section */}
                                    <div className="pt-4 flex flex-col space-y-2.5 border-t border-white/5 mt-5">
                                        <button
                                            onClick={() =>
                                                setShowResetConfirm(true)
                                            }
                                            className="text-left text-[10px] font-bold uppercase tracking-wider text-foreground/45 hover:text-red-400 transition-colors cursor-pointer select-none"
                                        >
                                            Reset Local Application Data
                                        </button>
                                        {user && (
                                            <button
                                                onClick={() =>
                                                    setShowDeleteCloudConfirm(
                                                        true,
                                                    )
                                                }
                                                className="text-left text-[10px] font-bold uppercase tracking-wider text-foreground/45 hover:text-red-400 transition-colors cursor-pointer select-none"
                                            >
                                                Delete All Cloud Backup
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* RIGHT PANEL: Feature Tabs and Options content */}
                                <div className="flex-1 flex flex-col min-w-0 h-[380px] md:h-full overflow-hidden">
                                    {/* Right Dashboard Tabs Navigation */}
                                    <div className="flex space-x-2 border-b border-white/5 pb-2 shrink-0 select-none">
                                        <button
                                            onClick={() =>
                                                setActiveRightTab("manager")
                                            }
                                            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg font-bold text-[10px] uppercase tracking-wider transition-colors cursor-pointer ${
                                                activeRightTab === "manager"
                                                    ? "bg-primary/10 text-primary border border-primary/20"
                                                    : "text-foreground/45 hover:text-white border border-transparent"
                                            }`}
                                        >
                                            <Database className="w-3 h-3" />
                                            <span>Cloud Sync Manager</span>
                                        </button>
                                        <button
                                            onClick={() =>
                                                setActiveRightTab("forceOps")
                                            }
                                            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg font-bold text-[10px] uppercase tracking-wider transition-colors cursor-pointer ${
                                                activeRightTab === "forceOps"
                                                    ? "bg-primary/10 text-primary border border-primary/20"
                                                    : "text-foreground/45 hover:text-white border border-transparent"
                                            }`}
                                        >
                                            <RefreshCw className="w-3 h-3" />
                                            <span>Force Ops</span>
                                        </button>
                                        <button
                                            onClick={() =>
                                                setActiveRightTab("preferences")
                                            }
                                            className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg font-bold text-[10px] uppercase tracking-wider transition-colors cursor-pointer ${
                                                activeRightTab === "preferences"
                                                    ? "bg-primary/10 text-primary border border-primary/20"
                                                    : "text-foreground/45 hover:text-white border border-transparent"
                                            }`}
                                        >
                                            <Sliders className="w-3 h-3" />
                                            <span>Preferences</span>
                                        </button>
                                    </div>

                                    {/* Tabs content box */}
                                    <div className="flex-1 min-h-0 overflow-y-auto mt-4 pr-1 custom-scrollbar">
                                        {/* TAB 1: CLOUD DATA MANAGER */}
                                        {activeRightTab === "manager" && (
                                            <div className="space-y-4">
                                                {!user ? (
                                                    <div className="py-12 text-center text-xs text-foreground/40 font-medium">
                                                        Please sign in with
                                                        Google to manage your
                                                        cloud sync database.
                                                    </div>
                                                ) : (
                                                    <>
                                                        {/* Sub-tab selection */}
                                                        <div className="flex border-b border-white/5 text-[10px] select-none">
                                                            <button
                                                                onClick={() =>
                                                                    setManagerTab(
                                                                        "watchlist",
                                                                    )
                                                                }
                                                                className={`flex-1 pb-2 font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                                                                    managerTab ===
                                                                    "watchlist"
                                                                        ? "text-primary border-b-2 border-primary"
                                                                        : "text-foreground/45 hover:text-white"
                                                                }`}
                                                            >
                                                                Watchlist (
                                                                {
                                                                    counts.watchlist
                                                                }
                                                                )
                                                            </button>
                                                            <button
                                                                onClick={() =>
                                                                    setManagerTab(
                                                                        "history",
                                                                    )
                                                                }
                                                                className={`flex-1 pb-2 font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                                                                    managerTab ===
                                                                    "history"
                                                                        ? "text-primary border-b-2 border-primary"
                                                                        : "text-foreground/45 hover:text-white"
                                                                }`}
                                                            >
                                                                History (
                                                                {counts.history}
                                                                )
                                                            </button>
                                                        </div>

                                                        {/* Batch Selection Action row */}
                                                        <div className="flex items-center justify-between text-xxs text-foreground/60 px-1 select-none">
                                                            <button
                                                                onClick={
                                                                    toggleSelectAll
                                                                }
                                                                className="hover:text-white font-bold transition-colors cursor-pointer"
                                                            >
                                                                {selectedItems.length ===
                                                                    (managerTab ===
                                                                    "watchlist"
                                                                        ? cloudWatchlist.length
                                                                        : cloudHistory.length) &&
                                                                (managerTab ===
                                                                "watchlist"
                                                                    ? cloudWatchlist.length
                                                                    : cloudHistory.length) >
                                                                    0
                                                                    ? "Deselect All"
                                                                    : "Select All"}
                                                            </button>
                                                            <span>
                                                                {
                                                                    selectedItems.length
                                                                }{" "}
                                                                selected
                                                            </span>
                                                        </div>

                                                        {/* Cards list grid */}
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                                                            {managerTab ===
                                                            "watchlist" ? (
                                                                cloudWatchlist.length ===
                                                                0 ? (
                                                                    <div className="col-span-full py-8 text-center text-xs text-foreground/40 font-medium">
                                                                        No
                                                                        bookmarks
                                                                        synced
                                                                        in the
                                                                        cloud.
                                                                    </div>
                                                                ) : (
                                                                    cloudWatchlist.map(
                                                                        (
                                                                            item,
                                                                            idx,
                                                                        ) => (
                                                                            <div
                                                                                key={`${item.detailPath}-${idx}`}
                                                                                onClick={() =>
                                                                                    toggleItemSelection(
                                                                                        item.detailPath,
                                                                                    )
                                                                                }
                                                                                className="flex items-center space-x-2.5 bg-white/2 border border-white/5 hover:bg-white/5 rounded-2xl p-2 cursor-pointer transition-all duration-200"
                                                                            >
                                                                                <div
                                                                                    className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                                                                        selectedItems.includes(
                                                                                            item.detailPath,
                                                                                        )
                                                                                            ? "bg-primary border-primary text-white"
                                                                                            : "border-white/20 bg-zinc-900"
                                                                                    }`}
                                                                                >
                                                                                    {selectedItems.includes(
                                                                                        item.detailPath,
                                                                                    ) && (
                                                                                        <Check className="w-2.5 h-2.5 stroke-3" />
                                                                                    )}
                                                                                </div>
                                                                                <img
                                                                                    src={
                                                                                        item.coverUrl
                                                                                    }
                                                                                    alt={
                                                                                        item.title
                                                                                    }
                                                                                    className="w-7 h-10 object-cover rounded-lg shrink-0 bg-zinc-900"
                                                                                />
                                                                                <div className="min-w-0 flex-1">
                                                                                    <p className="text-[11px] font-black text-white truncate">
                                                                                        {
                                                                                            item.title
                                                                                        }
                                                                                    </p>
                                                                                    <span className="text-[8px] font-bold text-foreground/45 uppercase tracking-wider block mt-0.5">
                                                                                        {item.corner ||
                                                                                            "Bookmarks"}
                                                                                    </span>
                                                                                </div>
                                                                            </div>
                                                                        ),
                                                                    )
                                                                )
                                                            ) : cloudHistory.length ===
                                                              0 ? (
                                                                <div className="col-span-full py-8 text-center text-xs text-foreground/40 font-medium">
                                                                    No history
                                                                    synced in
                                                                    the cloud.
                                                                </div>
                                                            ) : (
                                                                cloudHistory.map(
                                                                    (item, idx) => (
                                                                        <div
                                                                            key={`${item.detailPath}-${idx}`}
                                                                            onClick={() =>
                                                                                toggleItemSelection(
                                                                                    item.detailPath,
                                                                                )
                                                                            }
                                                                            className="flex items-center space-x-2.5 bg-white/2 border border-white/5 hover:bg-white/5 rounded-2xl p-2 cursor-pointer transition-all duration-200"
                                                                        >
                                                                            <div
                                                                                className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                                                                    selectedItems.includes(
                                                                                        item.detailPath,
                                                                                    )
                                                                                        ? "bg-primary border-primary text-white"
                                                                                        : "border-white/20 bg-zinc-900"
                                                                                }`}
                                                                            >
                                                                                {selectedItems.includes(
                                                                                    item.detailPath,
                                                                                ) && (
                                                                                    <Check className="w-2.5 h-2.5 stroke-3" />
                                                                                )}
                                                                            </div>
                                                                            <img
                                                                                src={
                                                                                    item.coverUrl
                                                                                }
                                                                                alt={
                                                                                    item.title
                                                                                }
                                                                                className="w-7 h-10 object-cover rounded-lg shrink-0 bg-zinc-900"
                                                                            />
                                                                            <div className="min-w-0 flex-1">
                                                                                <p className="text-[11px] font-black text-white truncate">
                                                                                    {
                                                                                        item.title
                                                                                    }
                                                                                </p>
                                                                                <div className="flex items-center space-x-2 mt-0.5">
                                                                                    <span className="text-[8px] font-bold text-foreground/45 uppercase tracking-wider">
                                                                                        {item.isSeries
                                                                                            ? `S${item.season}E${item.episode}`
                                                                                            : "Movie"}
                                                                                    </span>
                                                                                    <span className="text-[8px] font-bold text-primary tracking-wider uppercase">
                                                                                        {Math.round(
                                                                                            item.progress,
                                                                                        )}

                                                                                        %
                                                                                    </span>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    ),
                                                                )
                                                            )}
                                                        </div>

                                                        {/* Batch actions footer */}
                                                        <div className="pt-2 flex justify-end shrink-0 select-none">
                                                            <button
                                                                onClick={
                                                                    handleDeleteSelected
                                                                }
                                                                disabled={
                                                                    selectedItems.length ===
                                                                        0 ||
                                                                    isDeletingCloud
                                                                }
                                                                className="py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-35 text-white font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                                <span>
                                                                    Delete
                                                                    Selected (
                                                                    {
                                                                        selectedItems.length
                                                                    }
                                                                    )
                                                                </span>
                                                            </button>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        )}

                                        {/* TAB 2: FORCE OPERATIONS */}
                                        {activeRightTab === "forceOps" && (
                                            <div className="space-y-4">
                                                {!user ? (
                                                    <div className="py-12 text-center text-xs text-foreground/40 font-medium">
                                                        Please sign in with
                                                        Google to run conflict
                                                        resolution operations.
                                                    </div>
                                                ) : (
                                                    <div className="grid grid-cols-1 gap-3">
                                                        {/* Force Push Card */}
                                                        <div className="bg-white/5 border border-white/5 p-4 rounded-2xl space-y-3">
                                                            <div className="flex items-start space-x-3">
                                                                <ArrowUpCircle className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                                                                <div>
                                                                    <h4 className="text-xs font-black text-white uppercase tracking-wider">
                                                                        Force
                                                                        Local to
                                                                        Cloud
                                                                        (Overwrite
                                                                        Cloud)
                                                                    </h4>
                                                                    <p className="text-[10px] text-foreground/60 leading-relaxed mt-1">
                                                                        Replaces
                                                                        all
                                                                        synced
                                                                        cloud
                                                                        datasets
                                                                        in
                                                                        Firestore
                                                                        with the
                                                                        current
                                                                        local
                                                                        browser
                                                                        data
                                                                        (history,
                                                                        watchlist,
                                                                        episode
                                                                        progression).
                                                                        Use this
                                                                        if your
                                                                        local
                                                                        states
                                                                        are
                                                                        correct
                                                                        and you
                                                                        want to
                                                                        reset
                                                                        your
                                                                        cloud
                                                                        backup.
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div className="flex justify-end pt-1 select-none">
                                                                <button
                                                                    onClick={
                                                                        handleForcePush
                                                                    }
                                                                    disabled={
                                                                        isForcePushing ||
                                                                        isForcePulling
                                                                    }
                                                                    className="py-2 px-3.5 rounded-xl border border-primary/20 hover:border-primary/45 bg-primary/5 hover:bg-primary/10 text-primary font-bold text-[10px] uppercase tracking-wider transition-all cursor-pointer flex items-center space-x-1.5 disabled:opacity-50"
                                                                >
                                                                    <Upload className="w-3 h-3" />
                                                                    <span>
                                                                        {isForcePushing
                                                                            ? "Pushing..."
                                                                            : "Overwrite Cloud Backup"}
                                                                    </span>
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Force Pull Card */}
                                                        <div className="bg-white/5 border border-white/5 p-4 rounded-2xl space-y-3">
                                                            <div className="flex items-start space-x-3">
                                                                <ArrowDownCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                                                                <div>
                                                                    <h4 className="text-xs font-black text-white uppercase tracking-wider">
                                                                        Force
                                                                        Cloud to
                                                                        Local
                                                                        (Overwrite
                                                                        Local)
                                                                    </h4>
                                                                    <p className="text-[10px] text-foreground/60 leading-relaxed mt-1">
                                                                        Replaces
                                                                        all
                                                                        local
                                                                        browser
                                                                        cache
                                                                        states
                                                                        with the
                                                                        remote
                                                                        cloud
                                                                        database
                                                                        copy.
                                                                        This
                                                                        wipes
                                                                        all
                                                                        bookmarks
                                                                        and
                                                                        progress
                                                                        on this
                                                                        local
                                                                        device
                                                                        and
                                                                        overrides
                                                                        them
                                                                        with
                                                                        your
                                                                        cloud
                                                                        account.
                                                                        (Triggers
                                                                        a quick
                                                                        page
                                                                        reload).
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div className="flex justify-end pt-1 select-none">
                                                                <button
                                                                    onClick={
                                                                        handleForcePull
                                                                    }
                                                                    disabled={
                                                                        isForcePushing ||
                                                                        isForcePulling
                                                                    }
                                                                    className="py-2 px-3.5 rounded-xl border border-emerald-500/20 hover:border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-400 font-bold text-[10px] uppercase tracking-wider transition-all cursor-pointer flex items-center space-x-1.5 disabled:opacity-50"
                                                                >
                                                                    <Download className="w-3 h-3" />
                                                                    <span>
                                                                        {isForcePulling
                                                                            ? "Pulling..."
                                                                            : "Overwrite Local Device"}
                                                                    </span>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* TAB 3: PREFERENCES SETTINGS */}
                                        {activeRightTab === "preferences" && (
                                            <div className="space-y-4 pr-1">
                                                {/* Theme Setting */}
                                                <div className="flex items-center justify-between p-3.5 bg-white/5 border border-white/5 rounded-2xl text-xs">
                                                    <div>
                                                        <span className="font-semibold text-white block">
                                                            Theme Mode
                                                        </span>
                                                        <span className="text-[9px] text-foreground/45 block mt-0.5">
                                                            Toggle light or dark
                                                            modes
                                                        </span>
                                                    </div>
                                                    <div className="flex bg-zinc-900 border border-white/5 p-1 rounded-xl select-none">
                                                        <button
                                                            onClick={() =>
                                                                updatePrefTheme(
                                                                    "dark",
                                                                )
                                                            }
                                                            className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                                                                prefTheme ===
                                                                "dark"
                                                                    ? "bg-primary text-white shadow-lg"
                                                                    : "text-foreground/45 hover:text-white"
                                                            }`}
                                                        >
                                                            Dark
                                                        </button>
                                                        <button
                                                            onClick={() =>
                                                                updatePrefTheme(
                                                                    "light",
                                                                )
                                                            }
                                                            className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                                                                prefTheme ===
                                                                "light"
                                                                    ? "bg-primary text-white shadow-lg"
                                                                    : "text-foreground/45 hover:text-white"
                                                            }`}
                                                        >
                                                            Light
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Subtitle font setting */}
                                                <div className="flex items-center justify-between p-3.5 bg-white/5 border border-white/5 rounded-2xl text-xs">
                                                    <div>
                                                        <span className="font-semibold text-white block">
                                                            Player Subtitle Size
                                                        </span>
                                                        <span className="text-[9px] text-foreground/45 block mt-0.5">
                                                            Changes size inside
                                                            player subtitles
                                                        </span>
                                                    </div>
                                                    <select
                                                        value={prefSubtitleSize}
                                                        onChange={(e) =>
                                                            updatePrefSubtitleSize(
                                                                e.target.value,
                                                            )
                                                        }
                                                        className="bg-zinc-900 border border-white/10 rounded-xl px-2.5 py-1.5 text-white text-xs select-none focus:outline-none cursor-pointer"
                                                    >
                                                        <option value="16px">
                                                            Small (16px)
                                                        </option>
                                                        <option value="22px">
                                                            Medium (22px)
                                                        </option>
                                                        <option value="26px">
                                                            Large (26px)
                                                        </option>
                                                        <option value="32px">
                                                            Extra Large (32px)
                                                        </option>
                                                    </select>
                                                </div>

                                                {/* Player Autoplay Toggle */}
                                                <div className="flex items-center justify-between p-3.5 bg-white/5 border border-white/5 rounded-2xl text-xs">
                                                    <div>
                                                        <span className="font-semibold text-white block">
                                                            Autoplay Next
                                                            Episode
                                                        </span>
                                                        <span className="text-[9px] text-foreground/45 block mt-0.5">
                                                            Automatically plays
                                                            next checklist entry
                                                        </span>
                                                    </div>
                                                    <button
                                                        onClick={() =>
                                                            updatePrefAutoplay(
                                                                !prefAutoplay,
                                                            )
                                                        }
                                                        className={`w-10 h-6 flex items-center rounded-full p-1 transition-colors duration-300 cursor-pointer ${
                                                            prefAutoplay
                                                                ? "bg-primary"
                                                                : "bg-zinc-800"
                                                        }`}
                                                    >
                                                        <div
                                                            className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${
                                                                prefAutoplay
                                                                    ? "translate-x-4"
                                                                    : "translate-x-0"
                                                            }`}
                                                        />
                                                    </button>
                                                </div>

                                                {/* Player Auto Resume Toggle */}
                                                <div className="flex items-center justify-between p-3.5 bg-white/5 border border-white/5 rounded-2xl text-xs">
                                                    <div>
                                                        <span className="font-semibold text-white block">
                                                            Auto Resume Video
                                                        </span>
                                                        <span className="text-[9px] text-foreground/45 block mt-0.5">
                                                            Start video from
                                                            last saved progress
                                                            timestamp
                                                        </span>
                                                    </div>
                                                    <button
                                                        onClick={() =>
                                                            updatePrefAutoResume(
                                                                !prefAutoResume,
                                                            )
                                                        }
                                                        className={`w-10 h-6 flex items-center rounded-full p-1 transition-colors duration-300 cursor-pointer ${
                                                            prefAutoResume
                                                                ? "bg-primary"
                                                                : "bg-zinc-800"
                                                        }`}
                                                    >
                                                        <div
                                                            className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-300 ${
                                                                prefAutoResume
                                                                    ? "translate-x-4"
                                                                    : "translate-x-0"
                                                            }`}
                                                        />
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
