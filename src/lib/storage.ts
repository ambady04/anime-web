// Module-level UID storage — set by AuthProvider when user logs in.
// This avoids the race condition where Firebase Auth's currentUser
// isn't populated yet when sync operations fire.
let _currentUid: string | null = null;

export function setCurrentUid(uid: string | null) {
    _currentUid = uid;
}

export function getCurrentUid(): string | null {
    return _currentUid;
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
    // Watch History — returns deduplicated list (one entry per series/movie) for UI display.
    // For per-episode resume lookup, use getRawHistory() instead.
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

    // Raw history — returns ALL entries (including per-episode entries for series).
    // Used by VideoPlayer to look up resume position for specific episodes.
    getRawHistory: (): HistoryItem[] => {
        if (typeof window === "undefined") return [];
        try {
            const data = localStorage.getItem("kixo_history");
            if (!data) return [];
            const history = JSON.parse(data) as HistoryItem[];
            return [...history].sort((a, b) => b.updatedAt - a.updatedAt);
        } catch {
            return [];
        }
    },

    saveHistoryItem: (item: Omit<HistoryItem, "updatedAt">) => {
        if (typeof window === "undefined") return;
        try {
            // Read raw history (not deduplicated) to preserve per-episode entries
            const data = localStorage.getItem("kixo_history");
            const history: HistoryItem[] = data ? JSON.parse(data) : [];

            // For series: only remove the entry for the SAME episode (not all entries for the title).
            // For movies: remove any existing entry for the same detailPath.
            const filtered = history.filter((h) => {
                if (item.isSeries && item.season && item.episode) {
                    // Keep entries for other episodes of the same series
                    return !(
                        h.detailPath === item.detailPath &&
                        h.season === item.season &&
                        h.episode === item.episode
                    );
                }
                // Movies: deduplicate by detailPath
                return h.detailPath !== item.detailPath;
            });

            const newItem: HistoryItem = {
                ...item,
                updatedAt: Date.now(),
            };

            // Keep more entries to accommodate per-episode history (max 200 entries)
            const updated = [newItem, ...filtered].slice(0, 200);
            localStorage.setItem("kixo_history", JSON.stringify(updated));

            // Sync to cloud every 15 seconds of progress or on completion
            // (avoids excessive Firestore writes while still keeping cloud updated)
            const uid = _currentUid;
            if (uid) {
                const shouldSync =
                    item.progress >= 95 || // completed
                    Math.floor(item.currentTime) % 15 === 0; // every 15s
                if (shouldSync) {
                    import("./sync").then(({ syncHistoryItemToCloud }) => {
                        syncHistoryItemToCloud(uid, newItem).catch((err) => {
                            console.error(
                                "[sync] Background history save failed:",
                                err,
                            );
                        });
                    });
                }
            }
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

            // Background Cloud Sync
            const uid = _currentUid;
            if (uid) {
                import("./firebase").then(
                    async ({ ensureFirebase, getFirebaseDb }) => {
                        await ensureFirebase();
                        const db = getFirebaseDb();
                        const { doc, deleteDoc } =
                            await import("firebase/firestore");
                        const docRef = doc(
                            db,
                            "users",
                            uid,
                            "history",
                            encodeURIComponent(detailPath),
                        );
                        deleteDoc(docRef).catch((err: any) => {
                            console.error(
                                "[sync] Background history delete failed:",
                                err,
                            );
                        });
                    },
                );
            }
        } catch {}
    },

    clearHistory: () => {
        if (typeof window === "undefined") return;
        localStorage.removeItem("kixo_history");

        // Background Cloud Sync
        const uid = _currentUid;
        if (uid) {
            import("./firebase")
                .then(async ({ ensureFirebase, getFirebaseDb }) => {
                    await ensureFirebase();
                    const db = getFirebaseDb();
                    const { collection, getDocs, writeBatch } =
                        await import("firebase/firestore");
                    const historyCol = collection(db, "users", uid, "history");
                    const snapshot = await getDocs(historyCol);
                    const batch = writeBatch(db);
                    snapshot.forEach((docSnap: any) => {
                        batch.delete(docSnap.ref);
                    });
                    await batch.commit();
                })
                .catch((err: any) => {
                    console.error(
                        "[sync] Background history clear failed:",
                        err,
                    );
                });
        }
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
                        const uid = _currentUid;
                        if (uid) {
                            const capturedKey = key;
                            import("./firebase").then(
                                async ({ ensureFirebase, getFirebaseDb }) => {
                                    await ensureFirebase();
                                    const db = getFirebaseDb();
                                    const { doc, deleteDoc } =
                                        await import("firebase/firestore");
                                    const cleanKey = capturedKey.replace(
                                        "kixo_ep__",
                                        "",
                                    );
                                    const docRef = doc(
                                        db,
                                        "users",
                                        uid,
                                        "watched_episodes",
                                        encodeURIComponent(cleanKey),
                                    );
                                    deleteDoc(docRef).catch(() => {});
                                },
                            );
                        }
                    }
                }
            } else {
                updated = [item, ...watchlist];
                added = true;
            }

            localStorage.setItem("kixo_watchlist", JSON.stringify(updated));

            // Background Cloud Sync
            const uid = _currentUid;
            if (uid) {
                import("./sync").then(({ syncWatchlistItemToCloud }) => {
                    syncWatchlistItemToCloud(uid, item, exists).catch(() => {});
                });
            }
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

            // Background Cloud Sync
            const uid = _currentUid;
            if (uid) {
                import("./sync").then(({ syncWatchlistItemToCloud }) => {
                    syncWatchlistItemToCloud(uid, updatedItem).catch(() => {});
                });
            }
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
            const wasAlreadyWatched = existing.has(episode);
            existing.add(episode);
            const epsArr = Array.from(existing);
            localStorage.setItem(key, JSON.stringify(epsArr));

            // Only sync to cloud if this is a new mark (avoid duplicate writes)
            const uid = _currentUid;
            if (uid && !wasAlreadyWatched) {
                import("./sync").then(({ syncWatchedEpisodesToCloud }) => {
                    syncWatchedEpisodesToCloud(
                        uid,
                        detailPath,
                        season,
                        epsArr,
                    ).catch((err) => {
                        console.error("[sync] Episode watch sync failed:", err);
                    });
                });
            }
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

            // Background Cloud Sync
            const uid = _currentUid;
            if (uid) {
                import("./sync").then(({ syncWatchedEpisodesToCloud }) => {
                    syncWatchedEpisodesToCloud(
                        uid,
                        detailPath,
                        season,
                        epsArr,
                    ).catch(() => {});
                });
            }
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

            // Background Cloud Sync
            const uid = _currentUid;
            if (uid) {
                import("./sync").then(({ syncWatchedEpisodesToCloud }) => {
                    syncWatchedEpisodesToCloud(
                        uid,
                        detailPath,
                        season,
                        eps,
                    ).catch(() => {});
                });
            }
        } catch {}
    },

    clearSeasonWatched: (detailPath: string, season: number) => {
        if (typeof window === "undefined") return;
        try {
            const key = `kixo_ep__${detailPath}__s${season}`;
            localStorage.removeItem(key);

            // Background Cloud Sync
            const uid = _currentUid;
            if (uid) {
                import("./firebase").then(
                    async ({ ensureFirebase, getFirebaseDb }) => {
                        await ensureFirebase();
                        const db = getFirebaseDb();
                        const { doc, deleteDoc } =
                            await import("firebase/firestore");
                        const cleanKey = `${detailPath}__s${season}`;
                        const docRef = doc(
                            db,
                            "users",
                            uid,
                            "watched_episodes",
                            encodeURIComponent(cleanKey),
                        );
                        deleteDoc(docRef).catch(() => {});
                    },
                );
            }
        } catch {}
    },
};
