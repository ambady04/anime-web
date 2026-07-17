/**
 * Lightweight browser-side API response cache using sessionStorage.
 * Prevents redundant fetches during a session while keeping data fresh via TTL.
 *
 * - Home, details, search, category: cached with configurable TTL
 * - Stream: NEVER cached (CDN tokens expire quickly)
 *
 * sessionStorage is used instead of localStorage because:
 * 1. It auto-clears when the tab is closed (no stale data across sessions)
 * 2. Each tab gets its own cache (no cross-tab conflicts)
 * 3. No manual expiration cleanup needed on app start
 */

const CACHE_PREFIX = "kixo_api_";

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number;
}

/**
 * Get a cached API response if it exists and hasn't expired.
 */
export function getCached<T>(key: string): T | null {
    if (typeof window === "undefined") return null;

    try {
        const raw = sessionStorage.getItem(CACHE_PREFIX + key);
        if (!raw) return null;

        const entry: CacheEntry<T> = JSON.parse(raw);
        const age = Date.now() - entry.timestamp;

        if (age > entry.ttl) {
            // Expired — remove and return null
            sessionStorage.removeItem(CACHE_PREFIX + key);
            return null;
        }

        return entry.data;
    } catch {
        return null;
    }
}

/**
 * Store an API response in the cache with a TTL (in milliseconds).
 */
export function setCache<T>(key: string, data: T, ttlMs: number): void {
    if (typeof window === "undefined") return;

    try {
        const entry: CacheEntry<T> = {
            data,
            timestamp: Date.now(),
            ttl: ttlMs,
        };
        sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
    } catch {
        // sessionStorage full or unavailable — fail silently
    }
}

/**
 * Invalidate a specific cache entry.
 */
export function invalidateCache(key: string): void {
    if (typeof window === "undefined") return;
    sessionStorage.removeItem(CACHE_PREFIX + key);
}

/**
 * Invalidate all API cache entries matching a prefix.
 * Useful for clearing all search results or all category data.
 */
export function invalidateCacheByPrefix(prefix: string): void {
    if (typeof window === "undefined") return;

    const fullPrefix = CACHE_PREFIX + prefix;
    const keysToRemove: string[] = [];

    for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key && key.startsWith(fullPrefix)) {
            keysToRemove.push(key);
        }
    }

    keysToRemove.forEach((k) => sessionStorage.removeItem(k));
}

/**
 * Generate a deterministic cache key from endpoint + params.
 */
export function makeCacheKey(
    endpoint: string,
    params: Record<string, string | number | boolean> = {},
): string {
    const sortedParams = Object.entries(params)
        .filter(([, val]) => val !== undefined && val !== null && val !== "")
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join("&");

    return sortedParams ? `${endpoint}?${sortedParams}` : endpoint;
}

// Default TTLs for different endpoint types
export const CACHE_TTL = {
    HOME: 5 * 60 * 1000, // 5 minutes — homepage data changes infrequently
    DETAILS: 10 * 60 * 1000, // 10 minutes — movie details rarely change
    SEARCH: 3 * 60 * 1000, // 3 minutes — search results can be cached briefly
    CATEGORY: 5 * 60 * 1000, // 5 minutes — category listings
    FILLERS: 60 * 60 * 1000, // 1 hour — filler data almost never changes
} as const;
