import { localStore, HistoryItem, WatchlistItem } from "./storage";

// Helper to escape detailPath for Firestore doc ID
const escapeKey = (key: string) => encodeURIComponent(key);
const unescapeKey = (key: string) => decodeURIComponent(key);

// Lazy getter for Firestore DB
async function getDb() {
    const { ensureFirebase, getFirebaseDb } = await import("./firebase");
    await ensureFirebase();
    return getFirebaseDb();
}

/**
 * Triggers full bidirectional sync between local localStorage and Firestore cloud collections
 */
export async function syncUserData(uid: string) {
    try {
        console.log("[sync] Starting data synchronization for user:", uid);
        const db = await getDb();
        const { collection, doc, getDocs, setDoc, deleteDoc, writeBatch } =
            await import("firebase/firestore");

        // 1. Sync Watchlist
        const localWatchlist = localStore.getWatchlist();
        const watchlistCol = collection(db, "users", uid, "watchlist");
        const cloudWatchlistSnapshot = await getDocs(watchlistCol);
        const cloudWatchlist: WatchlistItem[] = [];

        cloudWatchlistSnapshot.forEach((docSnap) => {
            cloudWatchlist.push(docSnap.data() as WatchlistItem);
        });

        // Merge watchlist: union based on detailPath
        const mergedWatchlist = [...localWatchlist];
        const cloudPaths = new Set(cloudWatchlist.map((w) => w.detailPath));
        const localPaths = new Set(localWatchlist.map((w) => w.detailPath));

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
                const docRef = doc(
                    db,
                    "users",
                    uid,
                    "watchlist",
                    escapeKey(localItem.detailPath),
                );
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

        cloudHistorySnapshot.forEach((docSnap) => {
            const h = docSnap.data() as HistoryItem;
            cloudHistoryMap.set(h.detailPath, h);
        });

        const mergedHistory: HistoryItem[] = [];
        const localHistoryMap = new Map(
            localHistory.map((h) => [h.detailPath, h]),
        );
        const allPaths = new Set([
            ...localHistoryMap.keys(),
            ...cloudHistoryMap.keys(),
        ]);

        for (const path of allPaths) {
            const localItem = localHistoryMap.get(path);
            const cloudItem = cloudHistoryMap.get(path);

            if (localItem && cloudItem) {
                if (localItem.updatedAt >= cloudItem.updatedAt) {
                    mergedHistory.push(localItem);
                } else {
                    mergedHistory.push(cloudItem);
                }
            } else if (localItem) {
                mergedHistory.push(localItem);
            } else if (cloudItem) {
                mergedHistory.push(cloudItem);
            }
        }

        // Sort descending by updatedAt
        mergedHistory.sort((a, b) => b.updatedAt - a.updatedAt);

        // Deduplicate merged history by clean base title
        const seenHistory = new Set<string>();
        const cleanMergedHistory: HistoryItem[] = [];
        const historyBatch = writeBatch(db);
        let historyBatchCount = 0;

        for (const item of mergedHistory) {
            const baseTitle = item.title
                .replace(/\[[^\]]+\]/g, "")
                .trim()
                .toLowerCase();
            if (!seenHistory.has(baseTitle)) {
                seenHistory.add(baseTitle);
                cleanMergedHistory.push(item);

                const docRef = doc(
                    db,
                    "users",
                    uid,
                    "history",
                    escapeKey(item.detailPath),
                );
                historyBatch.set(docRef, item);
                historyBatchCount++;
            } else {
                const docRef = doc(
                    db,
                    "users",
                    uid,
                    "history",
                    escapeKey(item.detailPath),
                );
                historyBatch.delete(docRef);
                historyBatchCount++;
            }
        }

        const slicedHistory = cleanMergedHistory.slice(0, 40);
        localStorage.setItem("kixo_history", JSON.stringify(slicedHistory));

        if (historyBatchCount > 0) {
            await historyBatch.commit();
        }

        // 3. Sync Watched Episode lists
        const cloudEpCol = collection(db, "users", uid, "watched_episodes");
        const cloudEpSnapshot = await getDocs(cloudEpCol);
        const cloudEpMap = new Map<
            string,
            { episodes: number[]; updatedAt: number }
        >();
        cloudEpSnapshot.forEach((docSnap) => {
            const rawKey = unescapeKey(docSnap.id);
            cloudEpMap.set(
                rawKey,
                docSnap.data() as { episodes: number[]; updatedAt: number },
            );
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
            const cleanKey = localKey.replace("kixo_ep__", "");
            const localDataRaw = localStorage.getItem(localKey);
            const localEps = localDataRaw
                ? (JSON.parse(localDataRaw) as number[])
                : [];

            const cloudData = cloudEpMap.get(cleanKey);
            if (cloudData) {
                const union = Array.from(
                    new Set([...localEps, ...cloudData.episodes]),
                );
                localStorage.setItem(localKey, JSON.stringify(union));

                if (union.length > cloudData.episodes.length) {
                    const docRef = doc(
                        db,
                        "users",
                        uid,
                        "watched_episodes",
                        escapeKey(cleanKey),
                    );
                    epBatch.set(docRef, {
                        episodes: union,
                        updatedAt: Date.now(),
                    });
                    epBatchCount++;
                }
            } else {
                const docRef = doc(
                    db,
                    "users",
                    uid,
                    "watched_episodes",
                    escapeKey(cleanKey),
                );
                epBatch.set(docRef, {
                    episodes: localEps,
                    updatedAt: Date.now(),
                });
                epBatchCount++;
            }
        }

        // Sync cloud-only keys to local
        for (const [cleanKey, cloudData] of cloudEpMap.entries()) {
            const localKey = `kixo_ep__${cleanKey}`;
            if (!localStorage.getItem(localKey)) {
                localStorage.setItem(
                    localKey,
                    JSON.stringify(cloudData.episodes),
                );
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
export async function syncWatchlistItemToCloud(
    uid: string,
    item: WatchlistItem,
    isDelete = false,
) {
    try {
        const db = await getDb();
        const { doc, setDoc, deleteDoc } = await import("firebase/firestore");
        const docRef = doc(
            db,
            "users",
            uid,
            "watchlist",
            escapeKey(item.detailPath),
        );
        if (isDelete) {
            await deleteDoc(docRef);
        } else {
            const cleanData = JSON.parse(JSON.stringify(item));
            await setDoc(docRef, cleanData);
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
        const db = await getDb();
        const { doc, setDoc } = await import("firebase/firestore");
        const docRef = doc(
            db,
            "users",
            uid,
            "history",
            escapeKey(item.detailPath),
        );
        const cleanData = JSON.parse(JSON.stringify(item));
        await setDoc(docRef, cleanData);
    } catch (e) {
        console.error("[sync] Failed to sync history item to cloud", e);
    }
}

/**
 * Deletes a single history item from Firestore cloud
 */
export async function deleteHistoryItemFromCloud(uid: string, detailPath: string) {
    try {
        const db = await getDb();
        const { doc, deleteDoc } = await import("firebase/firestore");
        const docRef = doc(
            db,
            "users",
            uid,
            "history",
            escapeKey(detailPath),
        );
        await deleteDoc(docRef);
    } catch (e) {
        console.error("[sync] Failed to delete history item from cloud", e);
    }
}

/**
 * Clears entire history collection from Firestore cloud
 */
export async function clearCloudHistory(uid: string) {
    try {
        const db = await getDb();
        const { collection, getDocs, writeBatch } = await import("firebase/firestore");
        const historyCol = collection(db, "users", uid, "history");
        const snapshot = await getDocs(historyCol);
        const batch = writeBatch(db);
        snapshot.forEach((docSnap) => {
            batch.delete(docSnap.ref);
        });
        await batch.commit();
    } catch (e) {
        console.error("[sync] Failed to clear cloud history", e);
    }
}

/**
 * Syncs a single season's watched episodes array to Firestore
 */
export async function syncWatchedEpisodesToCloud(
    uid: string,
    detailPath: string,
    season: number,
    episodes: number[],
) {
    try {
        const db = await getDb();
        const { doc, setDoc } = await import("firebase/firestore");
        const cleanKey = `${detailPath}__s${season}`;
        const docRef = doc(
            db,
            "users",
            uid,
            "watched_episodes",
            escapeKey(cleanKey),
        );
        await setDoc(docRef, { episodes, updatedAt: Date.now() });
    } catch (e) {
        console.error("[sync] Failed to sync watched episodes to cloud", e);
    }
}

/**
 * Bidirectional load/sync for a single series season's watched episode progress
 */
export async function syncSeasonWatchedEpisodes(
    uid: string,
    detailPath: string,
    season: number,
): Promise<Set<number>> {
    try {
        const db = await getDb();
        const { doc, getDoc, setDoc } = await import("firebase/firestore");
        const cleanKey = `${detailPath}__s${season}`;
        const docRef = doc(
            db,
            "users",
            uid,
            "watched_episodes",
            escapeKey(cleanKey),
        );
        const docSnap = await getDoc(docRef);

        const localKey = `kixo_ep__${cleanKey}`;
        const localDataRaw = localStorage.getItem(localKey);
        const localEps = localDataRaw
            ? (JSON.parse(localDataRaw) as number[])
            : [];

        if (docSnap.exists()) {
            const cloudData = docSnap.data() as { episodes: number[] };
            const union = Array.from(
                new Set([...localEps, ...cloudData.episodes]),
            );
            localStorage.setItem(localKey, JSON.stringify(union));

            if (union.length > cloudData.episodes.length) {
                await setDoc(docRef, {
                    episodes: union,
                    updatedAt: Date.now(),
                });
            }
            return new Set<number>(union);
        } else if (localEps.length > 0) {
            await setDoc(docRef, { episodes: localEps, updatedAt: Date.now() });
        }
        return new Set<number>(localEps);
    } catch (e) {
        console.error(
            "[sync] Real-time season episodes sync failed, falling back to local storage:",
            e,
        );
        const localKey = `kixo_ep__${detailPath}__s${season}`;
        const localDataRaw = localStorage.getItem(localKey);
        const localEps = localDataRaw
            ? (JSON.parse(localDataRaw) as number[])
            : [];
        return new Set<number>(localEps);
    }
}
