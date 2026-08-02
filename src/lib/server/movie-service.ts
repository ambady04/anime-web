import {
    HomepageData,
    ItemDetails,
    Subject,
    BannerItem,
    OperatingListItem,
} from "../api";

const H5_API_HOST_POOL = [
    "https://h5-api.aoneroom.com",
    "https://api6.aoneroom.com",
    "https://api5.aoneroom.com",
    "https://api4.aoneroom.com",
];

const DEFAULT_HEADERS = (adult = false) => {
    const playMode = adult ? "0" : "1";
    return {
        "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "X-Play-Mode": playMode,
        Referer: "https://videodownloader.site/",
        "X-Client-Info": JSON.stringify({
            "X-Play-Mode": playMode,
            timezone: "America/New_York",
            system_language: "en",
            region: "",
            lang: "en",
        }),
    };
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
    } = {},
): Promise<T> {
    const { method = "GET", body, adult = false, revalidateSeconds = 600 } = options;

    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== "") {
            searchParams.append(key, String(val));
        }
    });
    const queryString = searchParams.toString();
    const fullPath = queryString ? `${endpointPath}?${queryString}` : endpointPath;

    let lastError: Error | null = null;

    for (const host of H5_API_HOST_POOL) {
        try {
            const url = `${host}${fullPath}`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);

            const reqInit: RequestInit = {
                method,
                headers: {
                    ...DEFAULT_HEADERS(adult),
                    ...(body ? { "Content-Type": "application/json" } : {}),
                },
                body: body ? JSON.stringify(body) : undefined,
                signal: controller.signal,
                next: { revalidate: revalidateSeconds },
            };

            const res = await fetch(url, reqInit);
            clearTimeout(timeoutId);

            if (res.ok) {
                const data = await res.json();
                return data as T;
            }
            lastError = new Error(`Host ${host} returned status ${res.status}`);
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
        }
    }

    throw lastError || new Error(`All hosts exhausted for ${endpointPath}`);
}

export const movieService = {
    // 1. GET HOME
    getHome: async (adult = false): Promise<HomepageData> => {
        try {
            const rawData = await fetchFromPool<any>(
                "/wefeed-h5api-bff/home?host=moviebox.ph",
                {},
                { adult, revalidateSeconds: 600 },
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
        } catch {
            return { platformList: [], operatingList: [] };
        }
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

        // Try POST search first
        try {
            const rawData = await fetchFromPool<any>(
                "/wefeed-h5api-bff/subject/search",
                {},
                { method: "POST", body: payload, adult, revalidateSeconds: 600 },
            );
            const data = rawData.data || rawData;
            if (data && Array.isArray(data.items)) {
                const items: Subject[] = data.items.filter((i: Subject) =>
                    Boolean(i?.detailPath),
                );
                return { items: stripCamSubjects(items) };
            }
        } catch {
            // Ignore & attempt fallback
        }

        // Try GET search fallback
        try {
            const rawData = await fetchFromPool<any>(
                "/wefeed-h5api-bff/subject/search",
                { keyword: q, page, perPage: 24, subjectType: type ?? 0 },
                { method: "GET", adult, revalidateSeconds: 600 },
            );
            const data = rawData.data || rawData;
            if (data && Array.isArray(data.items)) {
                const items: Subject[] = data.items.filter((i: Subject) =>
                    Boolean(i?.detailPath),
                );
                return { items: stripCamSubjects(items) };
            }
        } catch {
            // Ignore
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
            { adult, revalidateSeconds: 600 },
        );

        const detailsData = (rawData.data || rawData) as ItemDetails;

        let relatedItems: Subject[] = [];
        if (detailsData.subject?.subjectId) {
            try {
                const recRaw = await fetchFromPool<any>(
                    "/wefeed-h5api-bff/subject/recommend",
                    { subjectId: detailsData.subject.subjectId },
                    { adult, revalidateSeconds: 600 },
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

            for (const host of H5_API_HOST_POOL) {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 3000);

                    const res = await fetch(
                        `${host}/wefeed-h5api-bff/home/movieFilter`,
                        {
                            method: "POST",
                            headers: {
                                ...DEFAULT_HEADERS(adult),
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify(payload),
                            signal: controller.signal,
                            next: { revalidate: 600 },
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
        } catch {
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
