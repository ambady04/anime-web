import { cache } from "react";
import { getCached, setCache, makeCacheKey, CACHE_TTL } from "./api-cache";

const isBrowser = typeof window !== "undefined";
export const API_BASE_URL = isBrowser
    ? ""
    : process.env.NEXT_PUBLIC_API_URL || "https://api.abisolutions.online";

export interface ImageModel {
    url: string;
    width?: number;
    height?: number;
    blurHash?: string;
}

export interface DubModel {
    subjectId: string;
    lanName: string;
    lanCode: string;
    original: boolean;
    type: number;
    detailPath: string;
}

export interface Subject {
    subjectId: string;
    subjectType: number; // 1 = Movie, 2 = TV Series, 7 = Short TV, etc.
    title: string;
    description: string;
    releaseDate: string;
    duration: number; // in seconds
    genre: string[];
    cover: ImageModel;
    countryName: string;
    imdbRatingValue: number;
    detailPath: string;
    corner?: string; // Dub/Language indicator, e.g. "Hindi"
    hasResource: boolean;
    season?: number;
    dubs?: DubModel[];
    imdbRatingCount?: number;
}

export interface BannerItem {
    id: string;
    title: string;
    image: ImageModel;
    url: string | null;
    subjectId: string;
    subjectType: number;
    subject: Subject | null;
    detailPath: string;
}

export interface FilterItem {
    title: string;
    url: string;
    query: string;
    image: ImageModel;
}

export interface PlatformItem {
    name: string;
    uploadBy: string;
}

export interface OperatingListItem {
    type: "BANNER" | "FILTER" | "SUBJECTS_MOVIE" | "CUSTOM" | "SPORT_LIVE";
    position: number;
    title: string;
    subjects: Subject[];
    banner: {
        items: BannerItem[];
    } | null;
    filters: FilterItem[];
    customData: any;
    genreTopId: string | null;
    detailPath: string;
    opId?: string;
}

export interface HomepageData {
    platformList: PlatformItem[];
    operatingList: OperatingListItem[];
}

export interface StarModel {
    avatarUrl: string;
    character: string;
    detailPath: string;
    name: string;
    staffId: string;
    staffType: number;
}

export interface SeasonResolution {
    epNum: number;
    resolution: number;
}

export interface SeasonModel {
    allEp: string;
    maxEp: number;
    resolutions: SeasonResolution[];
    se: number; // Season number
}

export interface ResourceModel {
    seasons: SeasonModel[];
    source: string;
    uploadBy: string;
}

export interface ItemDetails {
    subject: Subject;
    stars: StarModel[];
    resource: ResourceModel;
    metadata: {
        description: string;
        image: string;
        keyWords: string[];
        title: string;
        referer?: string;
        url?: string;
    };
    isForbid: boolean;
    watchTimeLimit: number;
    related: Subject[];
}

export interface DownloadLink {
    id: string;
    url: string;
    resolution: number; // e.g. 360, 480, 720, 1080
    size: number; // bytes
}

export interface Caption {
    id: string;
    lan: string; // language code, e.g. "en"
    lanName: string; // e.g. "English"
    url: string; // subtitle file URL (.srt)
    size: number;
    delay: number;
}

export interface StreamData {
    downloads: DownloadLink[];
    captions: Caption[];
    hasResource: boolean;
    limited: boolean;
    limitedCode: string;
    stream_domain: string;
}

// Core fetch function with proper caching
// On the browser: checks sessionStorage cache first (avoids redundant fetches)
// On the server: uses Next.js fetch cache with revalidate TTL
async function fetchFromApi<T>(
    endpoint: string,
    params: Record<string, string | number | boolean> = {},
    cacheOptions?: RequestInit["next"],
    browserCacheTtl?: number,
): Promise<T> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== "") {
            searchParams.append(key, String(val));
        }
    });

    const queryString = searchParams.toString();
    const fullEndpoint = queryString ? `${endpoint}?${queryString}` : endpoint;

    // Browser-side: check sessionStorage cache first
    if (isBrowser && browserCacheTtl) {
        const cacheKey = makeCacheKey(endpoint, params);
        const cached = getCached<T>(cacheKey);
        if (cached) return cached;
    }

    const fetchUrl = isBrowser
        ? fullEndpoint
        : `${API_BASE_URL}${fullEndpoint}`;

    // On the server (Cloudflare Worker SSR), forward the real user IP to the
    // backend so geo-restriction checks use the actual visitor's location,
    // not the Cloudflare datacenter IP. Without this, backend returns 404
    // "not available in your region" for titles that are fine for the user.
    const fetchHeaders: Record<string, string> = {};
    if (!isBrowser) {
        try {
            const { headers: getRequestHeaders } = await import("next/headers");
            const reqHeaders = await getRequestHeaders();
            const userIp =
                reqHeaders.get("cf-connecting-ip") ||
                reqHeaders.get("x-real-ip") ||
                reqHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
                "";
            if (userIp) {
                fetchHeaders["X-Forwarded-For"] = userIp;
                fetchHeaders["X-Real-IP"] = userIp;
            }
        } catch {
            // headers() not available in this context — proceed without
        }
    }

    const response = await fetch(fetchUrl, {
        headers: fetchHeaders,
        next: cacheOptions ?? { revalidate: 3600 },
    });

    if (!response.ok) {
        throw new Error(
            `Failed to fetch API endpoint ${endpoint}: ${response.statusText}`,
        );
    }

    const data = (await response.json()) as T;

    // Browser-side: store in sessionStorage cache
    if (isBrowser && browserCacheTtl) {
        const cacheKey = makeCacheKey(endpoint, params);
        setCache(cacheKey, data, browserCacheTtl);
    }

    return data;
}

// Server-side request deduplication using React cache()
// This prevents duplicate API calls within the same render pass
const getCachedHome = cache(async (adult: boolean): Promise<HomepageData> => {
    return fetchFromApi<HomepageData>("/api/home", { adult });
});

const getCachedDetails = cache(
    async (path: string, adult: boolean): Promise<ItemDetails> => {
        return fetchFromApi<ItemDetails>("/api/details", { path, adult });
    },
);

export const movieApi = {
    // Get homepage data - deduplicated per render, cached in browser for 5 min
    getHome: async (adult = false): Promise<HomepageData> => {
        if (!isBrowser) {
            return getCachedHome(adult);
        }
        return fetchFromApi<HomepageData>(
            "/api/home",
            { adult },
            undefined,
            CACHE_TTL.HOME,
        );
    },

    // Get details - deduplicated per render, cached in browser for 10 min
    getDetails: async (path: string, adult = false): Promise<ItemDetails> => {
        if (!isBrowser) {
            return getCachedDetails(path, adult);
        }
        return fetchFromApi<ItemDetails>(
            "/api/details",
            { path, adult },
            undefined,
            CACHE_TTL.DETAILS,
        );
    },

    // Get stream links and captions (NO CACHE — CDN URLs expire quickly)
    getStream: async (
        path: string,
        season = 0,
        episode = 0,
        adult = false,
    ): Promise<StreamData> => {
        const searchParams = new URLSearchParams();
        searchParams.append("path", path);
        if (season) searchParams.append("season", String(season));
        if (episode) searchParams.append("episode", String(episode));
        if (adult) searchParams.append("adult", String(adult));

        const endpoint = `/api/stream?${searchParams.toString()}`;
        const fetchUrl = isBrowser ? endpoint : `${API_BASE_URL}${endpoint}`;

        const response = await fetch(fetchUrl, {
            cache: "no-store", // NEVER cache stream URLs — they contain expiring CDN tokens
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch stream: ${response.statusText}`);
        }

        return response.json() as Promise<StreamData>;
    },

    // Search movies and series — cached in browser for 3 min
    search: async (
        q: string,
        page = 1,
        type?: number,
        adult = false,
    ): Promise<{ items: Subject[] }> => {
        return fetchFromApi<{ items: Subject[] }>(
            "/api/search",
            { q, page, type: type ?? "", adult },
            undefined,
            CACHE_TTL.SEARCH,
        );
    },

    // Get category listing — cached in browser for 5 min
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
        return fetchFromApi(
            "/api/category",
            {
                name,
                page,
                query: query ?? "",
                adult,
            },
            undefined,
            CACHE_TTL.CATEGORY,
        );
    },
};
