const isBrowser = typeof window !== "undefined";

export const API_BASE_URL = "";

export function getVideoProxyBase(): string {
    if (process.env.NEXT_PUBLIC_VIDEO_PROXY_URL) {
        return process.env.NEXT_PUBLIC_VIDEO_PROXY_URL;
    }
    return "/api/video";
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
    dubs?: Subject[];
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

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await fetch(fullEndpoint, {
                cache: "no-store",
            });

            if (response.ok) {
                return (await response.json()) as T;
            }

            const isTransient = [404, 502, 503, 504].includes(response.status);
            if (isTransient && attempt < maxRetries - 1) {
                await new Promise((r) => setTimeout(r, 300 * 3 ** attempt));
                continue;
            }

            throw new Error(
                `Failed to fetch API endpoint ${endpoint}: ${response.statusText}`,
            );
        } catch (err: unknown) {
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

export const isSeriesType = (subjectType?: number | null): boolean => {
    if (!subjectType) return false;
    return subjectType === 2 || subjectType === 7 || subjectType === 10;
};

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

const isCamSubject = (subject: Subject): boolean => {
    const corner = subject.corner?.toUpperCase() ?? "";
    return corner.includes("CAM");
};

const stripCamSubjects = (subjects: Subject[] | undefined | null): Subject[] =>
    (subjects ?? []).filter((s) => !isCamSubject(s));

export const movieApi = {
    getHome: async (adult = false): Promise<HomepageData> => {
        if (!isBrowser) {
            const { movieService } = await import("./server/movie-service");
            return movieService.getHome(adult);
        }
        return fetchFromApi<HomepageData>("/api/home", { adult });
    },

    getDetails: async (path: string, adult = false): Promise<ItemDetails> => {
        if (!isBrowser) {
            const { movieService } = await import("./server/movie-service");
            return movieService.getDetails(path, adult);
        }
        return fetchFromApi<ItemDetails>("/api/details", { path, adult });
    },

    getStream: async (
        path: string,
        season = 0,
        episode = 0,
        adult = false,
    ): Promise<StreamData> => {
        if (!isBrowser) {
            const { streamService } = await import("./server/stream-service");
            return streamService.getStream(path, season, episode, adult);
        }
        const params: Record<string, string | number | boolean> = { path };
        if (season) params.season = season;
        if (episode) params.episode = episode;
        if (adult) params.adult = adult;
        return fetchFromApi<StreamData>("/api/stream", params);
    },

    search: async (
        q: string,
        page = 1,
        type?: number,
        adult = false,
    ): Promise<{ items: Subject[] }> => {
        if (!isBrowser) {
            const { movieService } = await import("./server/movie-service");
            return movieService.search(q, page, type, adult);
        }
        return fetchFromApi<{ items: Subject[] }>("/api/search", {
            q,
            page,
            type: type ?? "",
            adult,
        });
    },

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
        if (!isBrowser) {
            const { movieService } = await import("./server/movie-service");
            return movieService.getCategory(name, page, query, adult);
        }
        return fetchFromApi<{
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
    },
};
