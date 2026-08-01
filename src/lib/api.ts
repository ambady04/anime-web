const isBrowser = typeof window !== "undefined";
export const API_BASE_URL = isBrowser
    ? ""
    : process.env.NEXT_PUBLIC_API_URL || "https://api.abisolutions.online";

// The CDN requires a specific Referer header that browsers can't set on <video>
// requests. The Vercel backend proxies video with the correct headers.
// CF Worker IPs are blocked by the CDN, so we call Vercel directly from the browser.

export function getVideoProxyBase(): string {
    if (process.env.NEXT_PUBLIC_VIDEO_PROXY_URL) {
        return process.env.NEXT_PUBLIC_VIDEO_PROXY_URL;
    }
    // In production hosted environments (e.g. Cloudflare Pages), call Vercel directly
    // to bypass Cloudflare Worker response body size limits and connection timeouts
    return typeof window !== "undefined" && window.location.hostname !== "localhost"
        ? "https://api.abisolutions.online/api/video"
        : "/api/video";
}

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

// Core fetch function — retries up to 3 times on transient errors.
// Transient errors include: network failures, 404, 502, 503, 504.
// A 404 on the first/second attempt is treated as transient (upstream flakiness).
// Only a 404 on the final attempt is thrown as a hard "not found" error.
async function fetchFromApi<T>(
    endpoint: string,
    params: Record<string, string | number | boolean> = {},
    maxRetries = 3,
): Promise<T> {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== "") {
            searchParams.append(key, String(val));
        }
    });

    const queryString = searchParams.toString();
    const fullEndpoint = queryString ? `${endpoint}?${queryString}` : endpoint;

    const fetchUrl = isBrowser
        ? fullEndpoint
        : `${API_BASE_URL}${fullEndpoint}`;

    // On the server (Cloudflare Worker SSR), forward the real user IP to the
    // backend so geo-restriction checks use the actual visitor's location.
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

    // Retry loop — handles transient upstream failures gracefully
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await fetch(fetchUrl, {
                headers: fetchHeaders,
                cache: "no-store",
            });

            if (response.ok) {
                return (await response.json()) as T;
            }

            // Transient status codes worth retrying: 404 (upstream flap), 502, 503, 504
            const isTransient = [404, 502, 503, 504].includes(response.status);
            if (isTransient && attempt < maxRetries - 1) {
                // Exponential backoff: 300ms, 900ms, …
                await new Promise((r) => setTimeout(r, 300 * 3 ** attempt));
                continue;
            }

            throw new Error(
                `Failed to fetch API endpoint ${endpoint}: ${response.statusText}`,
            );
        } catch (err: unknown) {
            // Network-level errors (no response at all) — always retry
            if (err instanceof Error && err.message.includes("Failed to fetch API endpoint")) {
                // This is our own error thrown above — don't re-wrap it
                lastError = err;
                if (attempt < maxRetries - 1) {
                    await new Promise((r) => setTimeout(r, 300 * 3 ** attempt));
                    continue;
                }
                throw lastError;
            }
            // Raw network error (fetch itself failed)
            lastError = err instanceof Error ? err : new Error(String(err));
            if (attempt < maxRetries - 1) {
                await new Promise((r) => setTimeout(r, 300 * 3 ** attempt));
                continue;
            }
            throw lastError;
        }
    }
    throw lastError ?? new Error(`Failed to fetch API endpoint ${endpoint}`);
}


// Helper to determine if a subjectType represents an episodic show (TV Series = 2, ShortTV = 7, Anime = 10)
export const isSeriesType = (subjectType?: number | null): boolean => {
    if (!subjectType) return false;
    return subjectType === 2 || subjectType === 7 || subjectType === 10;
};

// Helper to safely parse numeric resolution from number or string (e.g. "4K", "2160p", "1080P", "720p", 1080)
export const parseResolution = (res?: string | number | null): number => {
    if (typeof res === "number") return isNaN(res) ? 0 : res;
    if (!res) return 0;
    const str = String(res).trim().toUpperCase();
    if (str.includes("4K") || str.includes("UHD") || str.includes("2160")) return 2160;
    if (str.includes("2K") || str.includes("1440")) return 1440;
    if (str.includes("FHD") || str.includes("1080")) return 1080;
    if (str.includes("HD") || str.includes("720")) return 720;
    if (str.includes("SD") || str.includes("480")) return 480;
    if (str.includes("360")) return 360;
    const num = parseInt(str.replace(/\D/g, ""), 10);
    return isNaN(num) ? 0 : num;
};

// CAM releases are low-quality camcorder rips flagged via the `corner` label
// (e.g. "CAM", "CAMRip", "HDCAM"). We hide them from every listing and search
// result so users only ever see proper-quality titles.
const isCamSubject = (subject: Subject): boolean => {
    const corner = subject.corner?.toUpperCase() ?? "";
    return corner.includes("CAM");
};

const stripCamSubjects = (subjects: Subject[] | undefined | null): Subject[] =>
    (subjects ?? []).filter((s) => !isCamSubject(s));

export const movieApi = {
    // Get homepage data — always fresh
    getHome: async (adult = false): Promise<HomepageData> => {
        const data = await fetchFromApi<HomepageData>("/api/home", { adult });
        // Drop CAM titles from every shelf and banner carousel.
        if (data.operatingList) {
            data.operatingList = data.operatingList.map((op) => ({
                ...op,
                subjects: stripCamSubjects(op.subjects),
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

    // Get details — always fresh
    getDetails: async (path: string, adult = false): Promise<ItemDetails> => {
        const data = await fetchFromApi<ItemDetails>("/api/details", {
            path,
            adult,
        });
        // Hide CAM titles from the "related" recommendations.
        if (data.related) {
            data.related = stripCamSubjects(data.related);
        }
        return data;
    },

    // Get stream links and captions — always fresh
    getStream: async (
        path: string,
        season = 0,
        episode = 0,
        adult = false,
    ): Promise<StreamData> => {
        const params: Record<string, string | number | boolean> = { path };
        if (season) params.season = season;
        if (episode) params.episode = episode;
        if (adult) params.adult = adult;
        const data = await fetchFromApi<StreamData>("/api/stream", params);

        // Smart High-Res Fallback:
        // Upstream CDNs (MovieBox/Aoneroom) store master 1080p/4K streams under season 1 / episode 1 index.
        // If initial response doesn't contain a 1080p/4K stream (d.resolution >= 1080),
        // try querying candidate parameter tuples ([1,1], [0,1], [1,0]) to unlock all high-res streams.
        const hasHighRes = (data.downloads || []).some(
            (d) => parseResolution(d.resolution) >= 1080,
        );
        if (!hasHighRes) {
            const candidates = [[1, 1], [0, 1], [1, 0]];
            for (const [fbSeason, fbEpisode] of candidates) {
                if (fbSeason === season && fbEpisode === episode) continue;
                try {
                    const fbParams: Record<string, string | number | boolean> = {
                        path,
                        season: fbSeason,
                        episode: fbEpisode,
                    };
                    if (adult) fbParams.adult = adult;
                    const fbData = await fetchFromApi<StreamData>("/api/stream", fbParams);
                    if (fbData.downloads && fbData.downloads.length > 0) {
                        const fbHasHighRes = fbData.downloads.some(
                            (d) => parseResolution(d.resolution) >= 1080,
                        );
                        if (fbHasHighRes) {
                            const mergedMap = new Map<number, DownloadLink>();
                            for (const d of [...fbData.downloads, ...(data.downloads || [])]) {
                                const resNum = parseResolution(d.resolution);
                                if (!mergedMap.has(resNum) || d.size > (mergedMap.get(resNum)?.size || 0)) {
                                    mergedMap.set(resNum, d);
                                }
                            }
                            const mergedDownloads = Array.from(mergedMap.values()).sort(
                                (a, b) => parseResolution(b.resolution) - parseResolution(a.resolution),
                            );
                            return {
                                ...fbData,
                                downloads: mergedDownloads,
                                captions:
                                    fbData.captions && fbData.captions.length > 0
                                        ? fbData.captions
                                        : data.captions,
                            };
                        }
                    }
                } catch {
                    // Try next fallback candidate
                }
            }
        }

        return data;
    },

    // Search movies and series — always fresh
    search: async (
        q: string,
        page = 1,
        type?: number,
        adult = false,
    ): Promise<{ items: Subject[] }> => {
        const data = await fetchFromApi<{ items: Subject[] }>("/api/search", {
            q,
            page,
            type: type ?? "",
            adult,
        });
        // Never surface CAM titles in search results.
        return { ...data, items: stripCamSubjects(data.items) };
    },

    // Get category listing — always fresh
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
        const data = await fetchFromApi<{
            pager: {
                hasMore: boolean;
                nextPage: number;
                page: number;
                perPage: number;
                totalCount: number;
            };
            items: Subject[];
        }>("/api/category", {
            name,
            page,
            query: query ?? "",
            adult,
        });
        // Hide CAM titles from category / genre browsing.
        return { ...data, items: stripCamSubjects(data.items) };
    },
};
