const isBrowser = typeof window !== "undefined";

export const API_BASE_URL = "";

const H5_BASE = "https://h5-api.aoneroom.com";

const getClientHeaders = (adult = false) => {
    const playMode = adult ? "0" : "1";
    return {
        "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "X-Play-Mode": playMode,
        Referer: "https://videodownloader.site/",
        Origin: "https://videodownloader.site/",
    };
};

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
    subject?: Subject;
    detailPath?: string;
}

export interface BannerModule {
    items: BannerItem[];
}

export interface OperatingListItem {
    opId?: string;
    title: string;
    type: string; // e.g. "BANNER", "SUBJECTS_MOVIE", "FILTER"
    banner?: BannerModule;
    subjects?: Subject[];
    genreTopId: string | null;
    detailPath: string;
}

export interface HomepageData {
    platformList: PlatformItem[];
    operatingList: OperatingListItem[];
}

export interface PlatformItem {
    id: string;
    name: string;
    iconUrl: string;
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
    dubs?: DubModel[];
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
    maxRetries = 1,
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

            throw new Error(
                `Failed to fetch API endpoint ${endpoint}: ${response.statusText}`,
            );
        } catch (err: unknown) {
            lastError = err instanceof Error ? err : new Error(String(err));
            if (attempt < maxRetries - 1) {
                await new Promise((r) => setTimeout(r, 100));
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
        try {
            const res = await fetchFromApi<HomepageData>("/api/home", { adult });
            if (res && res.operatingList && res.operatingList.length > 0) return res;
        } catch {
            // Direct browser fallback
        }
        const directRes = await fetch(`${H5_BASE}/wefeed-h5api-bff/home?host=h5-api.aoneroom.com`, {
            headers: getClientHeaders(adult),
        });
        const json: any = await directRes.json();
        const data = (json.data || json) as HomepageData;
        if (data.operatingList) {
            data.operatingList = data.operatingList.map((op) => ({
                ...op,
                subjects: stripCamSubjects(
                    (op.subjects || []).filter((s) => Boolean(s.detailPath)),
                ),
            }));
        }
        return data;
    },

    getDetails: async (path: string, adult = false): Promise<ItemDetails> => {
        if (!isBrowser) {
            const { movieService } = await import("./server/movie-service");
            return movieService.getDetails(path, adult);
        }
        try {
            const res = await fetchFromApi<ItemDetails>("/api/details", { path, adult });
            if (res && res.subject) return res;
        } catch {
            // Direct browser fallback
        }
        const directRes = await fetch(`${H5_BASE}/wefeed-h5api-bff/detail?detailPath=${encodeURIComponent(path)}`, {
            headers: getClientHeaders(adult),
        });
        const json: any = await directRes.json();
        return (json.data || json) as ItemDetails;
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
        try {
            const params: Record<string, string | number | boolean> = { path };
            if (season) params.season = season;
            if (episode) params.episode = episode;
            if (adult) params.adult = adult;
            const res = await fetchFromApi<StreamData>("/api/stream", params);
            if (res && res.downloads && res.downloads.length > 0) return res;
        } catch {
            // Direct browser fallback
        }

        const details = await movieApi.getDetails(path, adult);
        const subjectId = details.subject?.subjectId;
        if (!subjectId) {
            return { downloads: [], captions: [], hasResource: false, limited: false, limitedCode: "", stream_domain: "https://videodownloader.site/" };
        }

        const isSeries = isSeriesType(details.subject?.subjectType);
        const reqSeason = season > 0 ? season : (isSeries ? 1 : 0);
        const reqEpisode = episode > 0 ? episode : (isSeries ? 1 : 0);

        let token = "";
        try {
            const tokenRes = await fetch(`${H5_BASE}/wefeed-h5api-bff/subject/search-suggest`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Referer: "https://videodownloader.site/" },
                body: JSON.stringify({ keyword: "avatar", perPage: 0 }),
            });
            const xUser = tokenRes.headers.get("x-user");
            if (xUser) token = JSON.parse(xUser).token;
        } catch {
            // Ignore
        }

        const dlRes = await fetch(`${H5_BASE}/wefeed-h5api-bff/subject/download?subjectId=${subjectId}&se=${reqSeason}&ep=${reqEpisode}&detailPath=${encodeURIComponent(path)}`, {
            headers: {
                ...getClientHeaders(adult),
                "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:137.0) Gecko/20100101 Firefox/137.0",
                ...(token ? { Authorization: `Bearer ${token}`, Cookie: `token=${token}` } : {}),
            },
        });
        const dlJson: any = await dlRes.json();
        const data = dlJson.data || dlJson;
        let downloads: DownloadLink[] = data.downloads || [];

        // Fallback to dub tracks if primary download is empty for series
        if (downloads.length === 0 && details.dubs && details.dubs.length > 0) {
            for (const dub of details.dubs) {
                if (!dub.detailPath || dub.detailPath === path) continue;
                try {
                    const dubDetails = await movieApi.getDetails(dub.detailPath, adult);
                    const dubSubId = dubDetails.subject?.subjectId;
                    if (!dubSubId) continue;

                    const dubDlRes = await fetch(`${H5_BASE}/wefeed-h5api-bff/subject/download?subjectId=${dubSubId}&se=${reqSeason}&ep=${reqEpisode}&detailPath=${encodeURIComponent(dub.detailPath)}`, {
                        headers: {
                            ...getClientHeaders(adult),
                            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:137.0) Gecko/20100101 Firefox/137.0",
                            ...(token ? { Authorization: `Bearer ${token}`, Cookie: `token=${token}` } : {}),
                        },
                    });
                    const dubJson: any = await dubDlRes.json();
                    const dubData = dubJson.data || dubJson;
                    if (dubData.downloads && dubData.downloads.length > 0) {
                        downloads = dubData.downloads;
                        break;
                    }
                } catch {
                    // Ignore dub error
                }
            }
        }

        return {
            downloads,
            captions: data.captions || [],
            hasResource: true,
            limited: Boolean(data.limited),
            limitedCode: data.limitedCode || "",
            stream_domain: "https://videodownloader.site/",
        };
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
        try {
            const res = await fetchFromApi<{ items: Subject[] }>("/api/search", {
                q,
                page,
                type: type ?? "",
                adult,
            });
            if (res && res.items && res.items.length > 0) return res;
        } catch {
            // Direct browser fallback
        }

        let token = "";
        try {
            const tokenRes = await fetch(`${H5_BASE}/wefeed-h5api-bff/subject/search-suggest`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Referer: "https://videodownloader.site/" },
                body: JSON.stringify({ keyword: "avatar", perPage: 0 }),
            });
            const xUser = tokenRes.headers.get("x-user");
            if (xUser) token = JSON.parse(xUser).token;
        } catch {
            // Ignore
        }

        const searchRes = await fetch(`${H5_BASE}/wefeed-h5api-bff/subject/search`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...getClientHeaders(adult),
                ...(token ? { Authorization: `Bearer ${token}`, Cookie: `token=${token}` } : {}),
            },
            body: JSON.stringify({ keyword: q, page, perPage: 24, subjectType: type ?? 0 }),
        });
        const json: any = await searchRes.json();
        const data = json.data || json;
        const rawItems = data.items || [];
        return { items: stripCamSubjects(rawItems.filter((i: Subject) => Boolean(i?.detailPath))) };
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
        try {
            const res = await fetchFromApi<{
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
            if (res && res.items && res.items.length > 0) return res;
        } catch {
            // Direct browser fallback
        }
        const searchRes = await movieApi.search(name, page, undefined, adult);
        return {
            pager: {
                hasMore: searchRes.items.length >= 20,
                nextPage: page + 1,
                page,
                perPage: 20,
                totalCount: searchRes.items.length,
            },
            items: searchRes.items,
        };
    },
};
