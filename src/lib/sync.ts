import { db } from "./firebase";
import { collection, doc, getDocs, setDoc, deleteDoc, writeBatch } from "firebase/firestore";
import { localStore, HistoryItem, WatchlistItem } from "./storage";

// Helper to escape detailPath for Firestore doc ID
const escapeKey = (key: string) => encodeURIComponent(key);
const unescapeKey = (key: string) => decodeURIComponent(key);

/**
 * Triggers full bidirectional sync between local localStorage and Firestore cloud collections
 */
export async function syncUserData(uid: string) {
    try {
        console.log("[sync] Starting data synchronization for user:", uid);
        
        // 1. Sync Watchlist
        const localWatchlist = localStore.getWatchlist();
        const watchlistCol = collection(db, "users", uid, "watchlist");
        const cloudWatchlistSnapshot = await getDocs(watchlistCol);
        const cloudWatchlist: WatchlistItem[] = [];
        
        cloudWatchlistSnapshot.forEach((doc) => {
            cloudWatchlist.push(doc.data() as WatchlistItem);
        });

        // Merge watchlist: union based on detailPath
        const mergedWatchlist = [...localWatchlist];
        const cloudPaths = new Set(cloudWatchlist.map(w => w.detailPath));
        const localPaths = new Set(localWatchlist.map(w => w.detailPath));

        // Add cloud-only items to local
        for (const cloudItem of cloudWatchlist) {
            if (!localPaths.has(cloudItem.detailPath)) {
                mergedWatchlist.push(cloudItem);
            }
        }

        // Save merged to local storage
        localStorage.setItem("kixo_watchlist", JSON.stringify(mergedWatchlist));

        // Upload local-only items to cloud
        const watchlistBatch = writeBatch(db);
        let watchlistBatchCount = 0;
        for (const localItem of localWatchlist) {
            if (!cloudPaths.has(localItem.detailPath)) {
                const docRef = doc(db, "users", uid, "watchlist", escapeKey(localItem.detailPath));
                watchlistBatch.set(docRef, localItem);
                watchlistBatchCount++;
            }
        }
        if (watchlistBatchCount > 0) {
            await watchlistBatch.commit();
        }

        // 2. Sync History
        const localHistory = localStore.getHistory();
        const historyCol = collection(db, "users", uid, "history");
        const cloudHistorySnapshot = await getDocs(historyCol);
        const cloudHistoryMap = new Map<string, HistoryItem>();
        
        cloudHistorySnapshot.forEach((doc) => {
            const h = doc.data() as HistoryItem;
            cloudHistoryMap.set(h.detailPath, h);
        });

        const mergedHistory: HistoryItem[] = [];
        const localHistoryMap = new Map(localHistory.map(h => [h.detailPath, h]));
        const allPaths = new Set([...localHistoryMap.keys(), ...cloudHistoryMap.keys()]);

        const historyBatch = writeBatch(db);
        let historyBatchCount = 0;

        for (const path of allPaths) {
            const localItem = localHistoryMap.get(path);
            const cloudItem = cloudHistoryMap.get(path);

            if (localItem && cloudItem) {
                // Both exist - compare timestamps to find latest
                if (localItem.updatedAt >= cloudItem.updatedAt) {
                    mergedHistory.push(localItem);
                    const docRef = doc(db, "users", uid, "history", escapeKey(path));
                    historyBatch.set(docRef, localItem);
                    historyBatchCount++;
                } else {
                    mergedHistory.push(cloudItem);
                }
            } else if (localItem) {
                // Local only - upload
                mergedHistory.push(localItem);
                const docRef = doc(db, "users", uid, "history", escapeKey(path));
                historyBatch.set(docRef, localItem);
                historyBatchCount++;
            } else if (cloudItem) {
                // Cloud only - keep
                mergedHistory.push(cloudItem);
            }
        }

        // Sort by updatedAt descending and limit to last 40 items
        mergedHistory.sort((a, b) => b.updatedAt - a.updatedAt);
        const slicedHistory = mergedHistory.slice(0, 40);
        localStorage.setItem("kixo_history", JSON.stringify(slicedHistory));

        if (historyBatchCount > 0) {
            await historyBatch.commit();
        }

        // 3. Sync Watched Episode lists
        const cloudEpCol = collection(db, "users", uid, "watched_episodes");
        const cloudEpSnapshot = await getDocs(cloudEpCol);
        const cloudEpMap = new Map<string, { episodes: number[], updatedAt: number }>();
        cloudEpSnapshot.forEach((doc) => {
            const rawKey = unescapeKey(doc.id);
            cloudEpMap.set(rawKey, doc.data() as { episodes: number[], updatedAt: number });
        });

        // Find all local keys of format `kixo_ep__*`
        const localEpKeys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith("kixo_ep__")) {
                localEpKeys.push(key);
            }
        }

        const epBatch = writeBatch(db);
        let epBatchCount = 0;

        // Sync local keys to cloud
        for (const localKey of localEpKeys) {
            const cleanKey = localKey.replace("kixo_ep__", ""); // detailPath__sSeason
            const localDataRaw = localStorage.getItem(localKey);
            const localEps = localDataRaw ? JSON.parse(localDataRaw) as number[] : [];
            
            const cloudData = cloudEpMap.get(cleanKey);
            if (cloudData) {
                // Take union of episodes watched
                const union = Array.from(new Set([...localEps, ...cloudData.episodes]));
                localStorage.setItem(localKey, JSON.stringify(union));
                
                if (union.length > cloudData.episodes.length) {
                    const docRef = doc(db, "users", uid, "watched_episodes", escapeKey(cleanKey));
                    epBatch.set(docRef, { episodes: union, updatedAt: Date.now() });
                    epBatchCount++;
                }
            } else {
                // Local only - upload
                const docRef = doc(db, "users", uid, "watched_episodes", escapeKey(cleanKey));
                epBatch.set(docRef, { episodes: localEps, updatedAt: Date.now() });
                epBatchCount++;
            }
        }

        // Sync cloud-only keys to local
        for (const [cleanKey, cloudData] of cloudEpMap.entries()) {
            const localKey = `kixo_ep__${cleanKey}`;
            if (!localStorage.getItem(localKey)) {
                localStorage.setItem(localKey, JSON.stringify(cloudData.episodes));
            }
        }

        if (epBatchCount > 0) {
            await epBatch.commit();
        }

        console.log("[sync] Data synchronization completed successfully.");
    } catch (e) {
        console.error("[sync] Sync failed:", e);
    }
}

/**
 * Syncs a single watchlist item to Firestore
 */
export async function syncWatchlistItemToCloud(uid: string, item: WatchlistItem, isDelete = false) {
    try {
        const docRef = doc(db, "users", uid, "watchlist", escapeKey(item.detailPath));
        if (isDelete) {
            await deleteDoc(docRef);
        } else {
            await setDoc(docRef, item);
        }
    } catch (e) {
        console.error("[sync] Failed to sync watchlist item to cloud", e);
    }
}

/**
 * Syncs a single history item to Firestore
 */
export async function syncHistoryItemToCloud(uid: string, item: HistoryItem) {
    try {
        const docRef = doc(db, "users", uid, "history", escapeKey(item.detailPath));
        await setDoc(docRef, item);
    } catch (e) {
        console.error("[sync] Failed to sync history item to cloud", e);
    }
}

/**
 * Syncs a single season's watched episodes array to Firestore
 */
export async function syncWatchedEpisodesToCloud(uid: string, detailPath: string, season: number, episodes: number[]) {
    try {
        const cleanKey = `${detailPath}__s${season}`;
        const docRef = doc(db, "users", uid, "watched_episodes", escapeKey(cleanKey));
        await setDoc(docRef, { episodes, updatedAt: Date.now() });
    } catch (e) {
        console.error("[sync] Failed to sync watched episodes to cloud", e);
    }
}
