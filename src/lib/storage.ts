import { auth } from "./firebase";
import { 
  syncHistoryItemToCloud, 
  syncWatchlistItemToCloud, 
  syncWatchedEpisodesToCloud 
} from "./sync";

export interface HistoryItem {
  detailPath: string;
  title: string;
  coverUrl: string;
  duration: number; // in seconds
  currentTime: number; // in seconds
  progress: number; // percentage 0-100
  updatedAt: number; // timestamp
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
    if (typeof window === 'undefined') return [];
    try {
      const data = localStorage.getItem('kixo_history');
      if (!data) return [];
      const history = JSON.parse(data) as HistoryItem[];
      
      const seen = new Set<string>();
      const deduplicated: HistoryItem[] = [];
      
      const sorted = [...history].sort((a, b) => b.updatedAt - a.updatedAt);
      for (const item of sorted) {
        const baseTitle = item.title.replace(/\[[^\]]+\]/g, "").trim().toLowerCase();
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

  saveHistoryItem: (item: Omit<HistoryItem, 'updatedAt'>) => {
    if (typeof window === 'undefined') return;
    try {
      const history = localStore.getHistory();
      const baseTitleOfNew = item.title.replace(/\[[^\]]+\]/g, "").trim().toLowerCase();
      const filtered = history.filter((h) => {
        const baseTitleOfExisting = h.title.replace(/\[[^\]]+\]/g, "").trim().toLowerCase();
        return baseTitleOfExisting !== baseTitleOfNew;
      });
      
      const newItem: HistoryItem = {
        ...item,
        updatedAt: Date.now(),
      };
      
      const updated = [newItem, ...filtered].slice(0, 40);
      localStorage.setItem('kixo_history', JSON.stringify(updated));

      // Background Cloud Firestore Sync
      if (auth.currentUser) {
        syncHistoryItemToCloud(auth.currentUser.uid, newItem).catch((err) => {
          console.error("[sync] Background history save failed:", err);
        });
      }
    } catch (e) {
      console.error('Failed to save watch history', e);
    }
  },

  removeHistoryItem: (detailPath: string) => {
    if (typeof window === 'undefined') return;
    try {
      const history = localStore.getHistory();
      const updated = history.filter((h) => h.detailPath !== detailPath);
      localStorage.setItem('kixo_history', JSON.stringify(updated));

      // Background Cloud Firestore Sync
      if (auth.currentUser) {
        const { db } = require("./firebase");
        const { doc, deleteDoc } = require("firebase/firestore");
        const docRef = doc(db, "users", auth.currentUser.uid, "history", encodeURIComponent(detailPath));
        deleteDoc(docRef).catch((err: any) => {
          console.error("[sync] Background history delete failed:", err);
        });
      }
    } catch {}
  },

  clearHistory: () => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('kixo_history');

    // Background Cloud Firestore Sync
    if (auth.currentUser) {
      const { db } = require("./firebase");
      const { collection, getDocs, writeBatch } = require("firebase/firestore");
      const uid = auth.currentUser.uid;
      const historyCol = collection(db, "users", uid, "history");
      getDocs(historyCol).then((snapshot: any) => {
        const batch = writeBatch(db);
        snapshot.forEach((doc: any) => {
          batch.delete(doc.ref);
        });
        return batch.commit();
      }).catch((err: any) => {
        console.error("[sync] Background history clear failed:", err);
      });
    }
  },

  // Watchlist / Favorites
  getWatchlist: (): WatchlistItem[] => {
    if (typeof window === 'undefined') return [];
    try {
      const data = localStorage.getItem('kixo_watchlist');
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  toggleWatchlist: (item: WatchlistItem): boolean => {
    if (typeof window === 'undefined') return false;
    try {
      const watchlist = localStore.getWatchlist();
      const exists = watchlist.some((w) => w.detailPath === item.detailPath);
      let updated;
      let added = false;
      
      if (exists) {
        updated = watchlist.filter((w) => w.detailPath !== item.detailPath);
        
        // When unbookmarking, automatically clear all episode watch checklists for this series
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && key.startsWith(`kixo_ep__${item.detailPath}__s`)) {
            localStorage.removeItem(key);

            // If logged in, queue deletion on Cloud Firestore as well
            if (auth.currentUser) {
              const { db } = require("./firebase");
              const { doc, deleteDoc } = require("firebase/firestore");
              const cleanKey = key.replace("kixo_ep__", "");
              const docRef = doc(db, "users", auth.currentUser.uid, "watched_episodes", encodeURIComponent(cleanKey));
              deleteDoc(docRef).catch((err: any) => {
                console.error("[sync] Background episode progress delete failed:", err);
              });
            }
          }
        }
      } else {
        updated = [item, ...watchlist];
        added = true;
      }
      
      localStorage.setItem('kixo_watchlist', JSON.stringify(updated));

      // Background Cloud Firestore Sync
      if (auth.currentUser) {
        syncWatchlistItemToCloud(auth.currentUser.uid, item, exists).catch((err) => {
          console.error("[sync] Background watchlist toggle failed:", err);
        });
      }
      return added;
    } catch {
      return false;
    }
  },

  isInWatchlist: (detailPath: string): boolean => {
    if (typeof window === 'undefined') return false;
    try {
      const watchlist = localStore.getWatchlist();
      return watchlist.some((w) => w.detailPath === detailPath);
    } catch {
      return false;
    }
  },

  getWatchlistItem: (detailPath: string): WatchlistItem | undefined => {
    if (typeof window === 'undefined') return undefined;
    try {
      const watchlist = localStore.getWatchlist();
      return watchlist.find((w) => w.detailPath === detailPath);
    } catch {
      return undefined;
    }
  },

  updateEpisodeBookmark: (item: WatchlistItem, season?: number, episode?: number) => {
    if (typeof window === 'undefined') return;
    try {
      const watchlist = localStore.getWatchlist();
      const exists = watchlist.some((w) => w.detailPath === item.detailPath);
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
      localStorage.setItem('kixo_watchlist', JSON.stringify(updated));

      // Background Cloud Firestore Sync
      if (auth.currentUser) {
        syncWatchlistItemToCloud(auth.currentUser.uid, updatedItem).catch((err) => {
          console.error("[sync] Background bookmark update failed:", err);
        });
      }
    } catch (e) {
      console.error('Failed to update episode bookmark', e);
    }
  },

  // Episode progress — tracks which episodes have been watched per show/season
  getWatchedEpisodes: (detailPath: string, season: number): Set<number> => {
    if (typeof window === 'undefined') return new Set();
    try {
      const key = `kixo_ep__${detailPath}__s${season}`;
      const data = localStorage.getItem(key);
      return data ? new Set<number>(JSON.parse(data)) : new Set();
    } catch {
      return new Set();
    }
  },

  markEpisodeWatched: (detailPath: string, season: number, episode: number) => {
    if (typeof window === 'undefined') return;
    try {
      const key = `kixo_ep__${detailPath}__s${season}`;
      const existing = localStore.getWatchedEpisodes(detailPath, season);
      existing.add(episode);
      const epsArr = Array.from(existing);
      localStorage.setItem(key, JSON.stringify(epsArr));

      // Background Cloud Firestore Sync
      if (auth.currentUser) {
        syncWatchedEpisodesToCloud(auth.currentUser.uid, detailPath, season, epsArr).catch((err) => {
          console.error("[sync] Background episode watch save failed:", err);
        });
      }
    } catch {}
  },

  markEpisodeUnwatched: (detailPath: string, season: number, episode: number) => {
    if (typeof window === 'undefined') return;
    try {
      const key = `kixo_ep__${detailPath}__s${season}`;
      const existing = localStore.getWatchedEpisodes(detailPath, season);
      existing.delete(episode);
      const epsArr = Array.from(existing);
      localStorage.setItem(key, JSON.stringify(epsArr));

      // Background Cloud Firestore Sync
      if (auth.currentUser) {
        syncWatchedEpisodesToCloud(auth.currentUser.uid, detailPath, season, epsArr).catch((err) => {
          console.error("[sync] Background episode watch remove failed:", err);
        });
      }
    } catch {}
  },

  markSeasonWatched: (detailPath: string, season: number, totalEpisodes: number) => {
    if (typeof window === 'undefined') return;
    try {
      const key = `kixo_ep__${detailPath}__s${season}`;
      const eps = Array.from({ length: totalEpisodes }, (_, i) => i + 1);
      localStorage.setItem(key, JSON.stringify(eps));

      // Background Cloud Firestore Sync
      if (auth.currentUser) {
        syncWatchedEpisodesToCloud(auth.currentUser.uid, detailPath, season, eps).catch((err) => {
          console.error("[sync] Background season watch save failed:", err);
        });
      }
    } catch {}
  },

  clearSeasonWatched: (detailPath: string, season: number) => {
    if (typeof window === 'undefined') return;
    try {
      const key = `kixo_ep__${detailPath}__s${season}`;
      localStorage.removeItem(key);

      // Background Cloud Firestore Sync
      if (auth.currentUser) {
        const { db } = require("./firebase");
        const { doc, deleteDoc } = require("firebase/firestore");
        const cleanKey = `${detailPath}__s${season}`;
        const docRef = doc(db, "users", auth.currentUser.uid, "watched_episodes", encodeURIComponent(cleanKey));
        deleteDoc(docRef).catch((err: any) => {
          console.error("[sync] Background season watch clear failed:", err);
        });
      }
    } catch {}
  },
};
