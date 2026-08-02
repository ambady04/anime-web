import { StreamData, DownloadLink, Caption } from "../api";
import { movieService } from "./movie-service";

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

const DEFAULT_HEADERS = (host: string, referer: string, adult = false) => {
    const playMode = adult ? "0" : "1";
    return {
        Host: host,
        Referer: referer,
        Origin: "https://videodownloader.site",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
        Accept: "application/json",
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
        const timeoutId = setTimeout(() => controller.abort(), 3500);

        const res = await fetch(url.toString(), {
            headers: DEFAULT_HEADERS(mirrorHost, referer, adult),
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

        const movieboxReferer = `https://h5.aoneroom.com/movies/${path}`;
        const referers = [movieboxReferer, "https://videodownloader.site/"];

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
                return normalizeStreamData(valid);
            }
        } catch {
            // Proceed to fallbacks
        }

        // ── DUB FALLBACK ──
        if (isEpisodic && subject.dubs && subject.dubs.length > 0) {
            for (const dub of subject.dubs) {
                if (!dub.detailPath || dub.detailPath === path) continue;
                try {
                    const dubDetails = await movieService.getDetails(
                        dub.detailPath,
                        adult,
                    );
                    if (dubDetails.subject?.subjectId) {
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
                                                dubDetails.subject.subjectId,
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
                        const validDub = dubResults.find(
                            (r) =>
                                r &&
                                r.hasResource &&
                                (r.downloads.length > 0 || r.captions.length > 0),
                        );
                        if (validDub) {
                            return normalizeStreamData(validDub);
                        }
                    }
                } catch {
                    // Try next dub
                }
            }
        }

        // Return empty stream payload if no mirrors responded
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

function normalizeStreamData(data: StreamData): StreamData {
    const seenUrls = new Set<string>();
    const cleanDownloads: DownloadLink[] = [];

    for (const d of data.downloads || []) {
        if (!d.url || seenUrls.has(d.url)) continue;
        seenUrls.add(d.url);
        cleanDownloads.push({
            ...d,
            resolution: parseResolution(d.resolution),
        });
    }

    cleanDownloads.sort(
        (a, b) => parseResolution(b.resolution) - parseResolution(a.resolution),
    );

    return {
        ...data,
        downloads: cleanDownloads,
        stream_domain: "https://videodownloader.site/",
    };
}
