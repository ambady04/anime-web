import { StreamData, DownloadLink, Caption } from "../api";
import { movieService, getAuthToken } from "./movie-service";

const MIRRORS = ["h5-api.aoneroom.com", "moviebox.ph", "moviebox.pk"];

const parseResolution = (res: any): number => {
    if (typeof res === "number") return isNaN(res) ? 0 : res;
    if (!res) return 0;
    const str = String(res).trim().toUpperCase();
    if (str.includes("4K") || str.includes("UHD") || str.includes("2160")) return 2160;
    if (str.includes("2K") || str.includes("1440")) return 1440;
    if (str.includes("FHD") || str.includes("1080")) return 1080;
    if (str.includes("HD") || str.includes("720")) return 720;
    if (str.includes("SD") || str.includes("480")) return 480;
    if (str.includes("360")) return 360;
    const nums = str.match(/\d+/g);
    return nums ? parseInt(nums[0], 10) : 0;
};

const getStreamHeaders = async (host: string, referer: string, adult = false) => {
    const playMode = adult ? "0" : "1";
    const token = await getAuthToken();

    const headers: Record<string, string> = {
        Referer: referer || "https://videodownloader.site/",
        Origin: "https://videodownloader.site/",
        "User-Agent":
            "Mozilla/5.0 (X11; Linux x86_64; rv:137.0) Gecko/20100101 Firefox/137.0",
        Accept: "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "X-Play-Mode": playMode,
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

async function fetchMirrorStream(
    mirrorHost: string,
    referer: string,
    endpointPath: string,
    subjectId: string,
    detailPath: string,
    season: number,
    episode: number,
    adult = false,
): Promise<StreamData | null> {
    try {
        const url = new URL(`https://${mirrorHost}${endpointPath}`);
        url.searchParams.set("subjectId", subjectId);
        url.searchParams.set("se", String(season));
        url.searchParams.set("ep", String(episode));
        url.searchParams.set("detailPath", detailPath);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const reqHeaders = await getStreamHeaders(mirrorHost, referer, adult);

        const res = await fetch(url.toString(), {
            headers: reqHeaders,
            signal: controller.signal,
            cache: "no-store",
        });

        clearTimeout(timeoutId);

        if (!res.ok) return null;
        const json: any = await res.json();
        const data = json.data || json;

        const downloads = (data.downloads || []).filter(
            (d: any) => d.url && String(d.url).trim(),
        );
        const captions = (data.captions || []).filter(
            (c: any) => c.url && String(c.url).trim(),
        );

        if ((downloads.length > 0 || captions.length > 0) && data.hasResource !== false) {
            return {
                downloads,
                captions,
                hasResource: true,
                limited: Boolean(data.limited),
                limitedCode: data.limitedCode || "",
                stream_domain: "https://videodownloader.site/",
            };
        }
    } catch {
        // Ignore timeouts and fetch errors for individual mirror attempts
    }
    return null;
}

export const streamService = {
    getStream: async (
        path: string,
        season = 0,
        episode = 0,
        adult = false,
    ): Promise<StreamData> => {
        if (!path) {
            throw new Error("Empty or invalid path");
        }

        // 1. Get subject details to retrieve subjectId and dub information
        const details = await movieService.getDetails(path, adult);
        const subject = details.subject;

        if (!subject || !subject.subjectId) {
            return {
                downloads: [],
                captions: [],
                hasResource: false,
                limited: false,
                limitedCode: "",
                stream_domain: "https://videodownloader.site/",
            };
        }

        const referers = ["https://videodownloader.site/", `https://h5.aoneroom.com/movies/${path}`];

        const isEpisodic =
            subject.subjectType === 2 ||
            subject.subjectType === 7 ||
            subject.subjectType === 10 ||
            (details.resource?.seasons && details.resource.seasons.length > 0);

        let attempts: Array<[number, number]> = [];
        if (season > 0 || episode > 0) {
            attempts = [[season, episode]];
        } else if (isEpisodic) {
            attempts = [
                [1, 1],
                [0, 0],
            ];
        } else {
            attempts = [
                [0, 0],
                [1, 1],
            ];
        }

        const endpoints = [
            "/wefeed-h5api-bff/subject/download", // V2 endpoint
            "/wefeed-h5-bff/web/subject/download", // V1 endpoint
        ];

        // ── TIER 1: Race mirror tasks ──
        const tier1Tasks: Promise<StreamData | null>[] = [];
        for (const mirror of MIRRORS) {
            for (const ref of referers) {
                for (const epPath of endpoints) {
                    for (const [sAtt, eAtt] of attempts) {
                        tier1Tasks.push(
                            fetchMirrorStream(
                                mirror,
                                ref,
                                epPath,
                                subject.subjectId,
                                path,
                                sAtt,
                                eAtt,
                                adult,
                            ),
                        );
                    }
                }
            }
        }

        try {
            const results = await Promise.all(tier1Tasks);
            const valid = results.find(
                (r) => r && r.hasResource && (r.downloads.length > 0 || r.captions.length > 0),
            );
            if (valid) {
                return valid;
            }
        } catch {
            // Fallthrough to dub track fallback
        }

        // ── TIER 2: Fallback to dub tracks ──
        const dubs = details.dubs || [];
        for (const dub of dubs) {
            if (!dub.detailPath || dub.detailPath === path) continue;
            try {
                const dubDetails = await movieService.getDetails(dub.detailPath, adult);
                const dubSubject = dubDetails.subject;
                if (!dubSubject || !dubSubject.subjectId) continue;

                const dubTasks: Promise<StreamData | null>[] = [];
                for (const mirror of MIRRORS) {
                    for (const ref of referers) {
                        for (const epPath of endpoints) {
                            for (const [sAtt, eAtt] of attempts) {
                                dubTasks.push(
                                    fetchMirrorStream(
                                        mirror,
                                        ref,
                                        epPath,
                                        dubSubject.subjectId,
                                        dub.detailPath,
                                        sAtt,
                                        eAtt,
                                        adult,
                                    ),
                                );
                            }
                        }
                    }
                }

                const dubResults = await Promise.all(dubTasks);
                const dubValid = dubResults.find(
                    (r) => r && r.hasResource && (r.downloads.length > 0 || r.captions.length > 0),
                );
                if (dubValid) {
                    return dubValid;
                }
            } catch {
                // Continue to next dub
            }
        }

        return {
            downloads: [],
            captions: [],
            hasResource: false,
            limited: false,
            limitedCode: "",
            stream_domain: "https://videodownloader.site/",
        };
    },
};
