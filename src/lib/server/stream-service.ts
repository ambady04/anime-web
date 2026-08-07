import crypto from "crypto";
import { StreamData, DownloadLink, Caption } from "../api";
import { movieService, getAuthToken } from "./movie-service";

// Real API host pool — sourced from MovieBox-Tui open-source client.
// These mobile/app API endpoints are NOT rate-limited like the h5-api.aoneroom.com web endpoint.
const MIRRORS = [
    "api6.aoneroom.com",
    "api5.aoneroom.com",
    "api4.aoneroom.com",
    "api4sg.aoneroom.com",
    "api3.aoneroom.com",
    "api6sg.aoneroom.com",
    "api.inmoviebox.com",
];

// Spoof a random residential IP to avoid datacenter IP blocks.
// This mirrors the `random_spoofed_ip()` approach in MovieBox-Tui.
function randomSpoofedIp(): string {
    const ranges = [
        [1, 9], [11, 126], [128, 169], [171, 172], [174, 191], [193, 197], [199, 203],
    ];
    const range = ranges[Math.floor(Math.random() * ranges.length)];
    const first = Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
    const rest = () => Math.floor(Math.random() * 255);
    return `${first}.${rest()}.${rest()}.${rest()}`;
}

function generateXClientToken(tsMs = Date.now()): string {
    const ts = String(tsMs);
    const reversedTs = ts.split("").reverse().join("");
    const hashVal = crypto.createHash("md5").update(reversedTs).digest("hex");
    return `${ts},${hashVal}`;
}

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
    const ts = Date.now();
    const token = await getAuthToken();
    const spoofedIp = randomSpoofedIp();

    const headers: Record<string, string> = {
        Referer: referer || "https://videodownloader.site/",
        Origin: "https://videodownloader.site/",
        "User-Agent":
            "Mozilla/5.0 (X11; Linux x86_64; rv:137.0) Gecko/20100101 Firefox/137.0",
        Accept: "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "X-Play-Mode": playMode,
        "X-Client-Token": generateXClientToken(ts),
        "X-Client-Info": JSON.stringify({
            "X-Play-Mode": playMode,
            timezone: "America/New_York",
            system_language: "en",
            region: "",
            lang: "en",
        }),
        // Spoof a residential IP to bypass datacenter (Cloudflare) IP rate-limits
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

        const rawDownloads =
            data.downloads ||
            data.downloadList ||
            data.resourceList ||
            data.sources ||
            data.playList ||
            [];

        const downloads: DownloadLink[] = rawDownloads
            .map((d: any, idx: number) => {
                const rawUrl =
                    d.url ||
                    d.playUrl ||
                    d.downloadUrl ||
                    d.videoUrl ||
                    d.hlsUrl ||
                    d.link ||
                    (typeof d === "string" ? d : "");
                if (!rawUrl || typeof rawUrl !== "string" || !rawUrl.trim())
                    return null;
                return {
                    id: String(d.id || d.resolution || idx),
                    url: rawUrl.trim(),
                    resolution: parseResolution(
                        d.resolution || d.quality || d.name || 720,
                    ),
                    size: Number(d.size || d.fileSize || 0),
                };
            })
            .filter((d: any): d is DownloadLink => d !== null);

        const rawCaptions = data.captions || data.captionList || [];
        const captions: Caption[] = rawCaptions
            .map((c: any, idx: number) => {
                const cUrl = c.url || c.link || "";
                if (!cUrl || typeof cUrl !== "string" || !cUrl.trim())
                    return null;
                return {
                    id: String(c.id || idx),
                    lan: c.lan || c.language || "en",
                    lanName: c.lanName || c.languageName || c.lan || "English",
                    url: cUrl.trim(),
                };
            })
            .filter((c: any): c is Caption => c !== null);

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

const streamCache = new Map<string, { data: StreamData; expiresAt: number }>();

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

        const cacheKey = `stream:${path}:s${season}:e${episode}:adult=${adult}`;
        const cached = streamCache.get(cacheKey);
        if (cached && Date.now() < cached.expiresAt) {
            return cached.data;
        }

        // 0. Primary: Fetch stream data from Render backend API
        try {
            const apiBase = (process.env.NEXT_PUBLIC_API_URL || "https://anime-api-arlv.onrender.com").replace(/\/+$/, "");
            const vUrl = new URL(`${apiBase}/api/stream`);
            vUrl.searchParams.set("path", path);
            if (season) vUrl.searchParams.set("season", String(season));
            if (episode) vUrl.searchParams.set("episode", String(episode));
            if (adult) vUrl.searchParams.set("adult", "true");

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6000);

            const vRes = await fetch(vUrl.toString(), {
                headers: { Accept: "application/json" },
                signal: controller.signal,
                cache: "no-store",
            });
            clearTimeout(timeoutId);

            if (vRes.ok) {
                const vData: any = await vRes.json();
                if (vData && Array.isArray(vData.downloads) && vData.downloads.length > 0) {
                    if (streamCache.size > 200) {
                        const firstKey = streamCache.keys().next().value;
                        if (firstKey) streamCache.delete(firstKey);
                    }
                    streamCache.set(cacheKey, { data: vData as StreamData, expiresAt: Date.now() + 3 * 60 * 1000 });
                    return vData as StreamData;
                }
            }
        } catch {
            // Ignore Vercel API errors and proceed to mirror fallback
        }

        // 1. Get subject details to retrieve subjectId and dub information
        let details: any = null;
        try {
            details = await movieService.getDetails(path, adult);
        } catch {
            // Details fetch failed — return empty stream structure cleanly
            return {
                downloads: [],
                captions: [],
                hasResource: false,
                limited: false,
                limitedCode: "",
                stream_domain: "https://videodownloader.site/",
            };
        }

        const subject = details?.subject;

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

        const referers = ["https://videodownloader.site/"];

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
            "/wefeed-h5api-bff/subject/download",
            "/wefeed-h5-bff/web/subject/download",
        ];

        // ── TIER 1: Race primary mirror tasks (bounded to top 3 mirrors to comply with subrequest limits) ──
        const primaryMirrors = MIRRORS.slice(0, 3);
        const tier1Tasks: Promise<StreamData | null>[] = [];
        for (const mirror of primaryMirrors) {
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
