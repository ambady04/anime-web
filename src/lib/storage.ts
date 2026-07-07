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
}

export const localStore = {
  // Watch History
  getHistory: (): HistoryItem[] => {
    if (typeof window === 'undefined') return [];
    try {
      const data = localStorage.getItem('kixo_history');
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  saveHistoryItem: (item: Omit<HistoryItem, 'updatedAt'>) => {
    if (typeof window === 'undefined') return;
    try {
      const history = localStore.getHistory();
      // Remove existing item if exists
      const filtered = history.filter((h) => h.detailPath !== item.detailPath);
      
      const newItem: HistoryItem = {
        ...item,
        updatedAt: Date.now(),
      };
      
      const updated = [newItem, ...filtered].slice(0, 40); // Keep last 40 items
      localStorage.setItem('kixo_history', JSON.stringify(updated));
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
    } catch {}
  },

  clearHistory: () => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('kixo_history');
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
      } else {
        updated = [item, ...watchlist];
        added = true;
      }
      
      localStorage.setItem('kixo_watchlist', JSON.stringify(updated));
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

  // Episode progress — tracks which episodes have been watched per show/season
  // Key format: `${detailPath}__s${season}`  Value: number[] of watched episode numbers
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
      localStorage.setItem(key, JSON.stringify(Array.from(existing)));
    } catch {}
  },
};
