// Lazy firebase imports — don't pull in the 360KB bundle at module level
async function getAuthCurrentUser() {
    try {
        const { ensureFirebase, getFirebaseAuth } = await import("./firebase");
        await ensureFirebase();
        return getFirebaseAuth().currentUser;
    } catch {
        return null;
    }
}

export interface HistoryItem {
    detailPath: string;
    title: string;
    coverUrl: string;
    duration: number;
    currentTime: number;
    progress: number;
    updatedAt: number;
    isSeries: boolean;
    season?: number;
    episode?: number;
}

export interface WatchlistItem {
    detailPath: string;
    title: string;
    coverUrl: string;
    subjectType: number;
    imdbRatingValue: number;
    releaseDate?: string;
    corner?: string;
    bookmarkedSeason?: number;
    bookmarkedEpisode?: number;
}

export const localStore = {
    // Watch History
    getHistory: (): HistoryItem[] => {
        if (typeof window === "undefined") return [];
        try {
            const data = localStorage.getItem("kixo_history");
            if (!data) return [];
            const history = JSON.parse(data) as HistoryItem[];

            const seen = new Set<string>();
            const deduplicated: HistoryItem[] = [];

            const sorted = [...history].sort(
                (a, b) => b.updatedAt - a.updatedAt,
            );
            for (const item of sorted) {
                const baseTitle = item.title
                    .replace(/\[[^\]]+\]/g, "")
                    .trim()
                    .toLowerCase();
                if (!seen.has(baseTitle)) {
                    seen.add(baseTitle);
                    deduplicated.push(item);
                }
            }
            return deduplicated;
        } catch {
            return [];
        }
    },

    saveHistoryItem: (item: Omit<HistoryItem, "updatedAt">) => {
        if (typeof window === "undefined") return;
        try {
            const history = localStore.getHistory();
            const baseTitleOfNew = item.title
                .replace(/\[[^\]]+\]/g, "")
                .trim()
                .toLowerCase();
            const filtered = history.filter((h) => {
                const baseTitleOfExisting = h.title
                    .replace(/\[[^\]]+\]/g, "")
                    .trim()
                    .toLowerCase();
                return baseTitleOfExisting !== baseTitleOfNew;
            });

            const newItem: HistoryItem = {
                ...item,
                updatedAt: Date.now(),
            };

            const updated = [newItem, ...filtered].slice(0, 40);
            localStorage.setItem("kixo_history", JSON.stringify(updated));

            // Background Cloud Firestore Sync (lazy)
            getAuthCurrentUser().then(async (currentUser) => {
                if (currentUser) {
                    const { syncHistoryItemToCloud } = await import("./sync");
                    syncHistoryItemToCloud(currentUser.uid, newItem).catch(
                        (err) => {
                            console.error(
                                "[sync] Background history save failed:",
                                err,
                            );
                        },
                    );
                }
            });
        } catch (e) {
            console.error("Failed to save watch history", e);
        }
    },

    removeHistoryItem: (detailPath: string) => {
        if (typeof window === "undefined") return;
        try {
            const history = localStore.getHistory();
            const updated = history.filter((h) => h.detailPath !== detailPath);
            localStorage.setItem("kixo_history", JSON.stringify(updated));

            // Background Cloud Sync (lazy)
            getAuthCurrentUser().then(async (currentUser) => {
                if (currentUser) {
                    const { ensureFirebase, getFirebaseDb } =
                        await import("./firebase");
                    await ensureFirebase();
                    const db = getFirebaseDb();
                    const { doc, deleteDoc } =
                        await import("firebase/firestore");
                    const docRef = doc(
                        db,
                        "users",
                        currentUser.uid,
                        "history",
                        encodeURIComponent(detailPath),
                    );
                    deleteDoc(docRef).catch((err: any) => {
                        console.error(
                            "[sync] Background history delete failed:",
                            err,
                        );
                    });
                }
            });
        } catch {}
    },

    clearHistory: () => {
        if (typeof window === "undefined") return;
        localStorage.removeItem("kixo_history");

        // Background Cloud Sync (lazy)
        getAuthCurrentUser()
            .then(async (currentUser) => {
                if (currentUser) {
                    const { ensureFirebase, getFirebaseDb } =
                        await import("./firebase");
                    await ensureFirebase();
                    const db = getFirebaseDb();
                    const { collection, getDocs, writeBatch } =
                        await import("firebase/firestore");
                    const uid = currentUser.uid;
                    const historyCol = collection(db, "users", uid, "history");
                    const snapshot = await getDocs(historyCol);
                    const batch = writeBatch(db);
                    snapshot.forEach((docSnap: any) => {
                        batch.delete(docSnap.ref);
                    });
                    await batch.commit();
                }
            })
            .catch((err: any) => {
                console.error("[sync] Background history clear failed:", err);
            });
    },

    // Watchlist / Favorites
    getWatchlist: (): WatchlistItem[] => {
        if (typeof window === "undefined") return [];
        try {
            const data = localStorage.getItem("kixo_watchlist");
            return data ? JSON.parse(data) : [];
        } catch {
            return [];
        }
    },

    toggleWatchlist: (item: WatchlistItem): boolean => {
        if (typeof window === "undefined") return false;
        try {
            const watchlist = localStore.getWatchlist();
            const exists = watchlist.some(
                (w) => w.detailPath === item.detailPath,
            );
            let updated;
            let added = false;

            if (exists) {
                updated = watchlist.filter(
                    (w) => w.detailPath !== item.detailPath,
                );

                // When unbookmarking, clear episode watch checklists
                for (let i = localStorage.length - 1; i >= 0; i--) {
                    const key = localStorage.key(i);
                    if (
                        key &&
                        key.startsWith(`kixo_ep__${item.detailPath}__s`)
                    ) {
                        localStorage.removeItem(key);

                        // Lazy cloud cleanup
                        getAuthCurrentUser().then(async (currentUser) => {
                            if (currentUser && key) {
                                const { ensureFirebase, getFirebaseDb } =
                                    await import("./firebase");
                                await ensureFirebase();
                                const db = getFirebaseDb();
                                const { doc, deleteDoc } =
                                    await import("firebase/firestore");
                                const cleanKey = key.replace("kixo_ep__", "");
                                const docRef = doc(
                                    db,
                                    "users",
                                    currentUser.uid,
                                    "watched_episodes",
                                    encodeURIComponent(cleanKey),
                                );
                                deleteDoc(docRef).catch(() => {});
                            }
                        });
                    }
                }
            } else {
                updated = [item, ...watchlist];
                added = true;
            }

            localStorage.setItem("kixo_watchlist", JSON.stringify(updated));

            // Background Cloud Sync (lazy)
            getAuthCurrentUser().then(async (currentUser) => {
                if (currentUser) {
                    const { syncWatchlistItemToCloud } = await import("./sync");
                    syncWatchlistItemToCloud(
                        currentUser.uid,
                        item,
                        exists,
                    ).catch(() => {});
                }
            });
            return added;
        } catch {
            return false;
        }
    },

    isInWatchlist: (detailPath: string): boolean => {
        if (typeof window === "undefined") return false;
        try {
            const watchlist = localStore.getWatchlist();
            return watchlist.some((w) => w.detailPath === detailPath);
        } catch {
            return false;
        }
    },

    getWatchlistItem: (detailPath: string): WatchlistItem | undefined => {
        if (typeof window === "undefined") return undefined;
        try {
            const watchlist = localStore.getWatchlist();
            return watchlist.find((w) => w.detailPath === detailPath);
        } catch {
            return undefined;
        }
    },

    updateEpisodeBookmark: (
        item: WatchlistItem,
        season?: number,
        episode?: number,
    ) => {
        if (typeof window === "undefined") return;
        try {
            const watchlist = localStore.getWatchlist();
            const exists = watchlist.some(
                (w) => w.detailPath === item.detailPath,
            );
            let updated;

            const updatedItem = {
                ...item,
                bookmarkedSeason: season,
                bookmarkedEpisode: episode,
            };

            if (exists) {
                updated = watchlist.map((w) => {
                    if (w.detailPath === item.detailPath) {
                        return updatedItem;
                    }
                    return w;
                });
            } else {
                updated = [updatedItem, ...watchlist];
            }
            localStorage.setItem("kixo_watchlist", JSON.stringify(updated));

            // Background Cloud Sync (lazy)
            getAuthCurrentUser().then(async (currentUser) => {
                if (currentUser) {
                    const { syncWatchlistItemToCloud } = await import("./sync");
                    syncWatchlistItemToCloud(
                        currentUser.uid,
                        updatedItem,
                    ).catch(() => {});
                }
            });
        } catch (e) {
            console.error("Failed to update episode bookmark", e);
        }
    },

    // Episode progress
    getWatchedEpisodes: (detailPath: string, season: number): Set<number> => {
        if (typeof window === "undefined") return new Set();
        try {
            const key = `kixo_ep__${detailPath}__s${season}`;
            const data = localStorage.getItem(key);
            return data ? new Set<number>(JSON.parse(data)) : new Set();
        } catch {
            return new Set();
        }
    },

    markEpisodeWatched: (
        detailPath: string,
        season: number,
        episode: number,
    ) => {
        if (typeof window === "undefined") return;
        try {
            const key = `kixo_ep__${detailPath}__s${season}`;
            const existing = localStore.getWatchedEpisodes(detailPath, season);
            existing.add(episode);
            const epsArr = Array.from(existing);
            localStorage.setItem(key, JSON.stringify(epsArr));

            // Background Cloud Sync (lazy)
            getAuthCurrentUser().then(async (currentUser) => {
                if (currentUser) {
                    const { syncWatchedEpisodesToCloud } =
                        await import("./sync");
                    syncWatchedEpisodesToCloud(
                        currentUser.uid,
                        detailPath,
                        season,
                        epsArr,
                    ).catch(() => {});
                }
            });
        } catch {}
    },

    markEpisodeUnwatched: (
        detailPath: string,
        season: number,
        episode: number,
    ) => {
        if (typeof window === "undefined") return;
        try {
            const key = `kixo_ep__${detailPath}__s${season}`;
            const existing = localStore.getWatchedEpisodes(detailPath, season);
            existing.delete(episode);
            const epsArr = Array.from(existing);
            localStorage.setItem(key, JSON.stringify(epsArr));

            // Background Cloud Sync (lazy)
            getAuthCurrentUser().then(async (currentUser) => {
                if (currentUser) {
                    const { syncWatchedEpisodesToCloud } =
                        await import("./sync");
                    syncWatchedEpisodesToCloud(
                        currentUser.uid,
                        detailPath,
                        season,
                        epsArr,
                    ).catch(() => {});
                }
            });
        } catch {}
    },

    markSeasonWatched: (
        detailPath: string,
        season: number,
        totalEpisodes: number,
    ) => {
        if (typeof window === "undefined") return;
        try {
            const key = `kixo_ep__${detailPath}__s${season}`;
            const eps = Array.from({ length: totalEpisodes }, (_, i) => i + 1);
            localStorage.setItem(key, JSON.stringify(eps));

            // Background Cloud Sync (lazy)
            getAuthCurrentUser().then(async (currentUser) => {
                if (currentUser) {
                    const { syncWatchedEpisodesToCloud } =
                        await import("./sync");
                    syncWatchedEpisodesToCloud(
                        currentUser.uid,
                        detailPath,
                        season,
                        eps,
                    ).catch(() => {});
                }
            });
        } catch {}
    },

    clearSeasonWatched: (detailPath: string, season: number) => {
        if (typeof window === "undefined") return;
        try {
            const key = `kixo_ep__${detailPath}__s${season}`;
            localStorage.removeItem(key);

            // Background Cloud Sync (lazy)
            getAuthCurrentUser().then(async (currentUser) => {
                if (currentUser) {
                    const { ensureFirebase, getFirebaseDb } =
                        await import("./firebase");
                    await ensureFirebase();
                    const db = getFirebaseDb();
                    const { doc, deleteDoc } =
                        await import("firebase/firestore");
                    const cleanKey = `${detailPath}__s${season}`;
                    const docRef = doc(
                        db,
                        "users",
                        currentUser.uid,
                        "watched_episodes",
                        encodeURIComponent(cleanKey),
                    );
                    deleteDoc(docRef).catch(() => {});
                }
            });
        } catch {}
    },
};
