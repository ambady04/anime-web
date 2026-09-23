import crypto from "crypto";
import {
    HomepageData,
    ItemDetails,
    Subject,
    BannerItem,
    OperatingListItem,
} from "../api";

// Real API host pool — same as MovieBox-Tui open-source client.
// These are mobile/app API endpoints, NOT rate-limited like h5-api.aoneroom.com.
const H5_HOSTS = [
    "https://api6.aoneroom.com",
    "https://api5.aoneroom.com",
    "https://api4.aoneroom.com",
    "https://api4sg.aoneroom.com",
    "https://api3.aoneroom.com",
    "https://api6sg.aoneroom.com",
    "https://api.inmoviebox.com",
    // Fallback to h5 web endpoint
    "https://h5-api.aoneroom.com",
];

// Spoof a random residential IP to bypass Cloudflare datacenter rate-limits.
function randomSpoofedIp(): string {
    const ranges = [
        [1, 9], [11, 126], [128, 169], [171, 172], [174, 191], [193, 197], [199, 203],
    ];
    const range = ranges[Math.floor(Math.random() * ranges.length)];
    const first = Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
    const rest = () => Math.floor(Math.random() * 255);
    return `${first}.${rest()}.${rest()}.${rest()}`;
}

let cachedAuthToken: string | null = null;

function generateXClientToken(tsMs = Date.now()): string {
    const ts = String(tsMs);
    const reversedTs = ts.split("").reverse().join("");
    const hashVal = crypto.createHash("md5").update(reversedTs).digest("hex");
    return `${ts},${hashVal}`;
}

export async function getAuthToken(): Promise<string | null> {
    if (cachedAuthToken) return cachedAuthToken;

    for (const host of H5_HOSTS) {
        try {
            const ts = Date.now();
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);

            const res = await fetch(`${host}/wefeed-h5api-bff/subject/search-suggest`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                    Accept: "application/json",
                    "X-Client-Token": generateXClientToken(ts),
                    Referer: "https://videodownloader.site/",
                    Origin: "https://videodownloader.site/",
                },
                body: JSON.stringify({ keyword: "avatar", perPage: 0 }),
                signal: controller.signal,
                cache: "no-store",
            });

            clearTimeout(timeoutId);

            const xUser = res.headers.get("x-user");
            if (xUser) {
                const parsed = JSON.parse(xUser);
                if (parsed.token) {
                    cachedAuthToken = parsed.token;
                    return cachedAuthToken;
                }
            }
        } catch {
            // Retry
        }
    }
    return null;
}

const getPublicHeaders = (adult = false) => {
    const playMode = adult ? "0" : "1";
    const ts = Date.now();
    const spoofedIp = randomSpoofedIp();
    return {
        "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "X-Play-Mode": playMode,
        "X-Client-Token": generateXClientToken(ts),
        Referer: "https://videodownloader.site/",
        Origin: "https://videodownloader.site/",
        "X-Client-Info": JSON.stringify({
            "X-Play-Mode": playMode,
            timezone: "America/New_York",
            system_language: "en",
            region: "",
            lang: "en",
        }),
        "X-Forwarded-For": spoofedIp,
        "X-Real-IP": spoofedIp,
        "CF-Connecting-IP": spoofedIp,
    };
};

const getHeaders = async (adult = false) => {
    const playMode = adult ? "0" : "1";
    const ts = Date.now();
    const token = await getAuthToken();
    const spoofedIp = randomSpoofedIp();

    const headers: Record<string, string> = {
        "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "X-Play-Mode": playMode,
        "X-Client-Token": generateXClientToken(ts),
        Referer: "https://videodownloader.site/",
        Origin: "https://videodownloader.site/",
        "X-Client-Info": JSON.stringify({
            "X-Play-Mode": playMode,
            timezone: "America/New_York",
            system_language: "en",
            region: "",
            lang: "en",
        }),
        "X-Forwarded-For": spoofedIp,
        "X-Real-IP": spoofedIp,
        "CF-Connecting-IP": spoofedIp,
    };

    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
        headers["Cookie"] = `token=${token}`;
    }

    return headers;
};

const isCamSubject = (subject: Subject): boolean => {
    const corner = subject.corner?.toUpperCase() ?? "";
    return corner.includes("CAM");
};

const stripCamSubjects = (subjects: Subject[] | undefined | null): Subject[] =>
    (subjects ?? []).filter((s) => !isCamSubject(s));

interface CacheEntry<T> {
    data: T;
    expiresAt: number;
}

class ServerCache {
    private store = new Map<string, CacheEntry<any>>();

    get<T>(key: string): T | null {
        const entry = this.store.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return null;
        }
        return entry.data as T;
    }

    set<T>(key: string, data: T, ttlMs: number): void {
        if (this.store.size > 300) {
            const oldestKey = this.store.keys().next().value;
            if (oldestKey) this.store.delete(oldestKey);
        }
        this.store.set(key, { data, expiresAt: Date.now() + ttlMs });
    }
}

const apiCache = new ServerCache();

async function fetchFromPool<T>(
    endpointPath: string,
    params: Record<string, string | number | boolean> = {},
    options: {
        method?: string;
        body?: any;
        adult?: boolean;
        revalidateSeconds?: number;
        useAuth?: boolean;
    } = {},
): Promise<T> {
    const { method = "GET", body, adult = false, useAuth = false } = options;

    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== "") {
            searchParams.append(key, String(val));
        }
    });
    const queryString = searchParams.toString();
    const fullPath = queryString ? `${endpointPath}?${queryString}` : endpointPath;

    // 0. Server-side In-Memory Cache Lookup
    const bodyKey = body ? JSON.stringify(body) : "";
    const cacheKey = `${method}:${fullPath}:${bodyKey}:adult=${adult}:auth=${useAuth}`;

    if (method === "GET") {
        const cached = apiCache.get<T>(cacheKey);
        if (cached) return cached;
    }

    // 1. Primary Render Backend API fetch
    try {
        let vUrl = "";
        const apiBase = (process.env.NEXT_PUBLIC_API_URL || "https://anime-api-arlv.onrender.com").replace(/\/+$/, "");
        if (endpointPath.includes("/home")) {
            vUrl = `${apiBase}/api/home${adult ? "?adult=true" : ""}`;
        } else if (endpointPath.includes("/detail") && params.detailPath) {
            vUrl = `${apiBase}/api/details?path=${encodeURIComponent(String(params.detailPath))}`;
        } else if (endpointPath.includes("/search") && body?.keyword) {
            vUrl = `${apiBase}/api/search?q=${encodeURIComponent(String(body.keyword))}&page=${body.page || 1}`;
        }

        if (vUrl) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);
            try {
                const vRes = await fetch(vUrl, { cache: "no-store", signal: controller.signal });
                clearTimeout(timeoutId);
                if (vRes.ok) {
                    const data = (await vRes.json()) as T;
                    if (method === "GET") {
                        apiCache.set(cacheKey, data, 15 * 60 * 1000); // 15 minute TTL
                    }
                    return data;
                }
            } catch {
                clearTimeout(timeoutId);
            }
        }
    } catch {
        // Fall back to direct pool mirrors below
    }

    let lastError: Error | null = null;
    const reqHeaders = useAuth ? await getHeaders(adult) : getPublicHeaders(adult);

    const reqInit: RequestInit = {
        method,
        headers: {
            ...reqHeaders,
            ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
    };

    // 2. Fallback: Race top 5 primary mirror hosts with 6000ms timeout
    const primaryHosts = H5_HOSTS.slice(0, 5);
    const fetchHost = async (host: string): Promise<T> => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        try {
            const res = await fetch(`${host}${fullPath}`, {
                ...reqInit,
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (!res.ok) throw new Error(`Status ${res.status}`);
            return (await res.json()) as T;
        } catch (err) {
            clearTimeout(timeoutId);
            throw err;
        }
    };

    try {
        const result = await Promise.any(primaryHosts.map((h) => fetchHost(h)));
        if (result) {
            if (method === "GET") {
                apiCache.set(cacheKey, result, 15 * 60 * 1000);
            }
            return result;
        }
    } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
    }

    // 3. Last resort: Try remaining hosts sequentially if mirror race timed out
    for (const host of H5_HOSTS.slice(5)) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            const res = await fetch(`${host}${fullPath}`, {
                ...reqInit,
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (res.ok) {
                const data = (await res.json()) as T;
                if (method === "GET") {
                    apiCache.set(cacheKey, data, 15 * 60 * 1000);
                }
                return data;
            }
        } catch {
            // Try next
        }
    }

    throw lastError || new Error(`All media mirrors exhausted for ${endpointPath}`);
}


export const movieService = {
    // 1. GET HOME
    getHome: async (adult = false): Promise<HomepageData> => {
        const rawData = await fetchFromPool<any>(
            "/wefeed-h5api-bff/home?host=h5-api.aoneroom.com",
            {},
            { adult, useAuth: false },
        );

        const data = (rawData.data || rawData) as HomepageData;

        if (data.operatingList) {
            data.operatingList = data.operatingList.map((op) => ({
                ...op,
                subjects: stripCamSubjects(
                    (op.subjects || []).filter((s) => Boolean(s.detailPath)),
                ),
                banner: op.banner
                    ? {
                          ...op.banner,
                          items: (op.banner.items ?? []).filter(
                              (b) => !(b.subject && isCamSubject(b.subject)),
                          ),
                      }
                    : op.banner,
            }));
        }

        return data;
    },

    // 2. SEARCH
    search: async (
        q: string,
        page = 1,
        type?: number,
        adult = false,
    ): Promise<{ items: Subject[] }> => {
        const payload = {
            keyword: q,
            page,
            perPage: 24,
            subjectType: type ?? 0,
        };

        try {
            const rawData = await fetchFromPool<any>(
                "/wefeed-h5api-bff/subject/search",
                {},
                { method: "POST", body: payload, adult, useAuth: true },
            );

            const data = rawData.data || rawData;
            const rawItems = data?.items || data?.list;
            if (Array.isArray(rawItems)) {
                const items: Subject[] = rawItems.filter((i: Subject) =>
                    Boolean(i?.detailPath),
                );
                return { items: stripCamSubjects(items) };
            }
        } catch (err) {
            console.error("search error:", err);
            cachedAuthToken = null;
        }

        return { items: [] };
    },

    // 3. GET DETAILS
    getDetails: async (path: string, adult = false): Promise<ItemDetails> => {
        if (!path) {
            throw new Error("Empty or invalid path");
        }

        let rawData: any;
        try {
            rawData = await fetchFromPool<any>(
                "/wefeed-h5api-bff/detail",
                { detailPath: path },
                { adult, useAuth: false },
            );
        } catch (err) {
            // Case-insensitive / search fallback: If path fails (e.g. wrong casing like YoJu6lgmUl9),
            // search for the title portion and find the canonical detailPath!
            try {
                const parts = path.split("-");
                const titleQuery = (
                    parts.length > 1 && parts[parts.length - 1].length >= 6
                        ? parts.slice(0, -1)
                        : parts
                ).join(" ");

                if (titleQuery) {
                    const searchRes = await movieService.search(titleQuery, 1, undefined, adult);
                    const match = (searchRes.items || []).find((item) => {
                        const iPath = (item.detailPath || "").toLowerCase();
                        const target = path.toLowerCase();
                        return (
                            iPath === target ||
                            iPath.includes(target) ||
                            target.includes(iPath) ||
                            (item.title && target.includes(item.title.toLowerCase().replace(/[^a-z0-9]/g, "-")))
                        );
                    });

                    if (match && match.detailPath && match.detailPath !== path) {
                        return movieService.getDetails(match.detailPath, adult);
                    }
                }
            } catch {
                /* fallthrough to original error */
            }
            throw err;
        }

        const detailsData = (rawData.data || rawData) as ItemDetails;

        let relatedItems: Subject[] = [];
        if (detailsData.subject?.subjectId) {
            try {
                const recRaw = await fetchFromPool<any>(
                    "/wefeed-h5api-bff/subject/recommend",
                    { subjectId: detailsData.subject.subjectId },
                    { adult, useAuth: false },
                );
                const recData = recRaw.data || recRaw;
                relatedItems = (recData.items || []).filter((i: Subject) =>
                    Boolean(i.detailPath),
                );
            } catch {
                relatedItems = [];
            }
        }

        detailsData.related = stripCamSubjects(relatedItems);
        return detailsData;
    },

    // 4. GET CATEGORY
    getCategory: async (
        name: string,
        page = 1,
        query?: string,
        adult = false,
    ): Promise<{
        pager: {
            hasMore: boolean;
            nextPage: number;
            page: number;
            perPage: number;
            totalCount: number;
        };
        items: Subject[];
    }> => {
        const CATEGORY_MAP: Record<string, any> = {
            hollywood: {
                country: "USA",
                classify: "All",
                genre: "All",
                sort: "ForYou",
                year: "All",
            },
            bollywood: {
                country: "India",
                classify: "All",
                genre: "All",
                sort: "ForYou",
                year: "All",
            },
            "hindi dub": {
                classify: "Hindi dub",
                country: "All",
                genre: "All",
                sort: "ForYou",
                year: "All",
            },
            korean: {
                country: "Korea",
                classify: "All",
                genre: "All",
                sort: "ForYou",
                year: "All",
            },
            english: {
                country: "USA",
                classify: "All",
                genre: "All",
                sort: "Update",
                year: "All",
            },
            malayalam: {
                country: "India",
                classify: "Malayalam",
                genre: "All",
                sort: "Update",
                year: "All",
            },
        };

        let filterType: any = null;
        let tabId = 2;

        if (query) {
            try {
                const parsed = new URLSearchParams(query);
                if (parsed.has("filterType")) {
                    filterType = JSON.parse(parsed.get("filterType")!);
                    tabId = parseInt(parsed.get("tabId") || "2", 10);
                }
            } catch {
                // Ignore parse errors
            }
        } else if (CATEGORY_MAP[name.toLowerCase()]) {
            filterType = CATEGORY_MAP[name.toLowerCase()];
        }

        if (filterType) {
            const payload = {
                tabId,
                page,
                filterType,
            };

            const reqHeaders = getPublicHeaders(adult);

            for (const host of H5_HOSTS) {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 4000);

                    const res = await fetch(
                        `${host}/wefeed-h5api-bff/home/movieFilter`,
                        {
                            method: "POST",
                            headers: {
                                ...reqHeaders,
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify(payload),
                            signal: controller.signal,
                            cache: "no-store",
                        },
                    );

                    clearTimeout(timeoutId);

                    if (res.ok) {
                        const json: any = await res.json();
                        const data = json.data || json;
                        const items: Subject[] = (data.items || []).filter(
                            (i: Subject) => Boolean(i.detailPath),
                        );
                        return {
                            pager: data.pager || {
                                hasMore: items.length > 0,
                                nextPage: page + 1,
                                page,
                                perPage: 20,
                                totalCount: items.length,
                            },
                            items: stripCamSubjects(items),
                        };
                    }
                } catch {
                    // Try next host
                }
            }
        }

        // Fallback: standard search query
        try {
            const searchResult = await movieService.search(name, page, undefined, adult);
            return {
                pager: {
                    hasMore: searchResult.items.length >= 20,
                    nextPage: page + 1,
                    page,
                    perPage: 20,
                    totalCount: searchResult.items.length,
                },
                items: searchResult.items,
            };
        } catch (err) {
            console.error("getCategory fallback error:", err);
            return {
                pager: {
                    hasMore: false,
                    nextPage: page + 1,
                    page,
                    perPage: 20,
                    totalCount: 0,
                },
                items: [],
            };
        }
    },
};
