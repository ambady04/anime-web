import crypto from "crypto";
import {
    HomepageData,
    ItemDetails,
    Subject,
    BannerItem,
    OperatingListItem,
} from "../api";

const H5_HOSTS = ["https://h5-api.aoneroom.com"];

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
    };
};

const getHeaders = async (adult = false) => {
    const playMode = adult ? "0" : "1";
    const ts = Date.now();
    const token = await getAuthToken();

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

    let lastError: Error | null = null;
    const reqHeaders = useAuth ? await getHeaders(adult) : getPublicHeaders(adult);

    for (const host of H5_HOSTS) {
        try {
            const url = `${host}${fullPath}`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);

            const reqInit: RequestInit = {
                method,
                headers: {
                    ...reqHeaders,
                    ...(body ? { "Content-Type": "application/json" } : {}),
                },
                body: body ? JSON.stringify(body) : undefined,
                signal: controller.signal,
                cache: "no-store",
            };

            const res = await fetch(url, reqInit);
            clearTimeout(timeoutId);

            if (res.ok) {
                const data = await res.json();
                return data as T;
            }
            lastError = new Error(`Service temporarily unavailable (${res.status})`);
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
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

        const rawData = await fetchFromPool<any>(
            "/wefeed-h5api-bff/detail",
            { detailPath: path },
            { adult, useAuth: false },
        );

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
