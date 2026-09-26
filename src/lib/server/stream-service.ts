import crypto from "crypto";
import { StreamData, DownloadLink, Caption } from "../api";
import { movieService, getAuthToken } from "./movie-service";

// Real API host pool — sourced from MovieBox-Tui open-source client.
// These mobile/app API endpoints are NOT rate-limited like the h5-api.aoneroom.com web endpoint.
const MIRRORS = [
    "h5-api.aoneroom.com",
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
        [1, 9],
        [11, 126],
        [128, 169],
        [171, 172],
        [174, 191],
        [193, 197],
        [199, 203],
    ];
    const range = ranges[Math.floor(Math.random() * ranges.length)];
    const first =
        Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
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
    if (str.includes("4K") || str.includes("UHD") || str.includes("2160"))
        return 2160;
    if (str.includes("2K") || str.includes("1440")) return 1440;
    if (str.includes("FHD") || str.includes("1080")) return 1080;
    if (str.includes("HD") || str.includes("720")) return 720;
    if (str.includes("SD") || str.includes("480")) return 480;
    if (str.includes("360")) return 360;
    const nums = str.match(/\d+/g);
    return nums ? parseInt(nums[0], 10) : 0;
};

const getStreamHeaders = async (
    host: string,
    referer: string,
    adult = false,
) => {
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
                    d.resourceLink ||
                    d.sourceUrl ||
                    d.resource_link ||
                    d.source_url ||
                    d.fallbackUrl ||
                    d.link ||
                    (typeof d === "string" ? d : "");
                if (
                    !rawUrl ||
                    typeof rawUrl !== "string" ||
                    !rawUrl.trim() ||
                    rawUrl.trim() === "None"
                )
                    return null;
                // Reject embed/iframe URLs
                if (d.isEmbed) return null;
                const lUrl = rawUrl.toLowerCase();
                try {
                    const hn = new URL(lUrl).hostname;
                    if (
                        hn.includes("vidsrc") ||
                        hn.includes("autoembed") ||
                        hn.includes("2embed") ||
                        hn.includes("vidplay") ||
                        hn.includes("superembed") ||
                        hn.includes("embedsu")
                    )
                        return null;
                } catch {
                    if (
                        lUrl.includes("vidsrc.") ||
                        lUrl.includes("autoembed.") ||
                        lUrl.includes("2embed.") ||
                        lUrl.includes("superembed.")
                    )
                        return null;
                }
                return {
                    id: String(d.id || d.resolution || idx),
                    url: rawUrl.trim(),
                    resolution: parseResolution(
                        d.resolution || d.quality || d.name || 720,
                    ),
                    size: Number(d.size || d.fileSize || 0),
                    resource_link: d.resourceLink || d.resource_link || "",
                    source_url: d.sourceUrl || d.source_url || "",
                };
            })
            .filter((d: any): d is DownloadLink => d !== null);

        // Add production embed servers as last-resort fallback
        // These use IMDB IDs (not internal subjectIds), so only add if we detect a valid IMDB-like ID
        // Note: Most embed services block embedding from unknown domains, so these are unreliable
        // and should only be used when no direct streams are available.

        const rawCaptions =
            data.captions ||
            data.captionList ||
            data.subtitles ||
            data.subtitleList ||
            data.subs ||
            [];
        const captions: Caption[] = rawCaptions
            .map((c: any, idx: number) => {
                const cUrl =
                    c.url || c.link || c.subUrl || c.subtitleUrl || "";
                if (!cUrl || typeof cUrl !== "string" || !cUrl.trim())
                    return null;
                return {
                    id: String(c.id || idx),
                    lan: c.lan || c.language || c.lang || "en",
                    lanName:
                        c.lanName ||
                        c.languageName ||
                        c.langName ||
                        c.name ||
                        c.lan ||
                        "English",
                    url: cUrl.trim(),
                };
            })
            .filter((c: any): c is Caption => c !== null);

        if (
            (downloads.length > 0 || captions.length > 0) &&
            data.hasResource !== false
        ) {
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

async function fetchCaptionsFromH5Api(
    subjectId: string,
    detailPath: string,
    season = 0,
    episode = 0,
    adult = false,
): Promise<Caption[]> {
    if (!subjectId) return [];
    try {
        const h5Base = "https://h5-api.aoneroom.com";
        const token = await getAuthToken();
        const spoofedIp = randomSpoofedIp();
        const h5Headers: Record<string, string> = {
            "User-Agent":
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
            Accept: "application/json",
            "Accept-Language": "en-US,en;q=0.9",
            Referer: "https://videodownloader.site/",
            Origin: "https://videodownloader.site",
            "X-Play-Mode": adult ? "0" : "1",
            "X-Client-Token": generateXClientToken(),
            "X-Forwarded-For": spoofedIp,
            "X-Real-IP": spoofedIp,
            ...(token
                ? {
                      Authorization: `Bearer ${token}`,
                      Cookie: `token=${token}`,
                  }
                : {}),
        };

        const reqSeason = season > 0 ? season : 0;
        const reqEpisode = episode > 0 ? episode : 0;
        const h5Url = `${h5Base}/wefeed-h5api-bff/subject/download?subjectId=${subjectId}&se=${reqSeason}&ep=${reqEpisode}&detailPath=${encodeURIComponent(detailPath)}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(h5Url, {
            headers: h5Headers,
            signal: controller.signal,
            cache: "no-store",
        });
        clearTimeout(timeoutId);

        if (!res.ok) return [];
        const json: any = await res.json();
        const data = json.data || json;
        const rawCaptions =
            data.captions ||
            data.captionList ||
            data.subtitles ||
            data.subtitleList ||
            data.subs ||
            [];
        return rawCaptions
            .map((c: any, idx: number) => {
                const cUrl =
                    c.url || c.link || c.subUrl || c.subtitleUrl || "";
                if (!cUrl || typeof cUrl !== "string" || !cUrl.trim())
                    return null;
                return {
                    id: String(c.id || idx),
                    lan: c.lan || c.language || c.lang || "en",
                    lanName:
                        c.lanName ||
                        c.languageName ||
                        c.langName ||
                        c.name ||
                        c.lan ||
                        "English",
                    url: cUrl.trim(),
                    size: Number(c.size || 0),
                    delay: Number(c.delay || 0),
                };
            })
            .filter((c: any): c is Caption => c !== null);
    } catch {
        return [];
    }
}

async function ensureCaptions(
    data: StreamData,
    path: string,
    subjectId?: string,
    season = 0,
    episode = 0,
    adult = false,
): Promise<StreamData> {
    if (data.captions && data.captions.length > 0) {
        return data;
    }

    let sId = subjectId;
    let resolvedDetailPath = path;
    let dubsList: any[] = [];

    try {
        const details = await movieService.getDetails(path, adult);
        if (!sId && details?.subject?.subjectId) {
            sId = details.subject.subjectId;
        }
        if (details?.subject?.detailPath) {
            resolvedDetailPath = details.subject.detailPath;
        }
        dubsList = details?.subject?.dubs || details?.dubs || [];
    } catch {
        /* ignore */
    }

    if (!sId) {
        const parts = path.split("-");
        sId = parts.length > 1 ? parts[parts.length - 1] : path;
    }

    if (sId) {
        let caps = await fetchCaptionsFromH5Api(
            sId,
            resolvedDetailPath,
            season,
            episode,
            adult,
        );

        // If no captions found on main subject, check dub tracks for captions
        if (caps.length === 0 && dubsList.length > 0) {
            for (const dub of dubsList) {
                if (dub.subjectId && dub.subjectId !== sId) {
                    const dubCaps = await fetchCaptionsFromH5Api(
                        dub.subjectId,
                        dub.detailPath || resolvedDetailPath,
                        season,
                        episode,
                        adult,
                    );
                    if (dubCaps.length > 0) {
                        caps = dubCaps;
                        break;
                    }
                }
            }
        }

        if (caps.length > 0) {
            data.captions = caps;
        }
    }

    return data;
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
            // Validate cached data doesn't contain only embed URLs
            const hasRealDownloads = (cached.data.downloads || []).some(
                (d: any) => {
                    if (d.isEmbed) return false;
                    const u = (d.url || "").toLowerCase();
                    if (
                        u.includes("vidsrc.") ||
                        u.includes("autoembed.") ||
                        u.includes("2embed.") ||
                        u.includes("superembed.")
                    )
                        return false;
                    return u.startsWith("http");
                },
            );
            if (hasRealDownloads) {
                if (!cached.data.captions || cached.data.captions.length === 0) {
                    cached.data = await ensureCaptions(
                        cached.data,
                        path,
                        undefined,
                        season,
                        episode,
                        adult,
                    );
                }
                return cached.data;
            }
            // Stale embed-only cache — discard and re-fetch
            streamCache.delete(cacheKey);
        }

        // 0. Primary: Fetch stream data from Render backend API
        try {
            const apiBase = (
                process.env.NEXT_PUBLIC_API_URL ||
                "https://anime-api-arlv.onrender.com"
            ).replace(/\/+$/, "");
            const vUrl = new URL(`${apiBase}/api/stream`);
            vUrl.searchParams.set("path", path);
            if (season) vUrl.searchParams.set("season", String(season));
            if (episode) vUrl.searchParams.set("episode", String(episode));
            if (adult) vUrl.searchParams.set("adult", "true");

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const vRes = await fetch(vUrl.toString(), {
                headers: { Accept: "application/json" },
                signal: controller.signal,
                cache: "no-store",
            });
            clearTimeout(timeoutId);

            if (vRes.ok) {
                let vData: any = await vRes.json();
                if (vData && Array.isArray(vData.downloads)) {
                    const validDownloads = vData.downloads.filter((d: any) => {
                        const dUrl =
                            d.url ||
                            d.resourceLink ||
                            d.resource_link ||
                            d.sourceUrl ||
                            d.source_url ||
                            "";
                        if (
                            !dUrl ||
                            typeof dUrl !== "string" ||
                            dUrl.trim() === "None"
                        )
                            return false;
                        // Reject embed/iframe URLs — only accept direct CDN stream URLs
                        if (d.isEmbed) return false;
                        const lUrl = dUrl.toLowerCase();
                        try {
                            const hostname = new URL(lUrl).hostname;
                            if (
                                hostname.includes("vidsrc") ||
                                hostname.includes("autoembed") ||
                                hostname.includes("2embed") ||
                                hostname.includes("vidplay") ||
                                hostname.includes("superembed") ||
                                hostname.includes("embedsu")
                            )
                                return false;
                        } catch {
                            if (
                                lUrl.includes("vidsrc.") ||
                                lUrl.includes("autoembed.") ||
                                lUrl.includes("2embed.") ||
                                lUrl.includes("superembed.")
                            )
                                return false;
                        }
                        return true;
                    });

                    if (validDownloads.length > 0) {
                        vData.downloads = validDownloads;
                        vData = await ensureCaptions(
                            vData,
                            path,
                            undefined,
                            season,
                            episode,
                            adult,
                        );
                        if (streamCache.size > 200) {
                            const firstKey = streamCache.keys().next().value;
                            if (firstKey) streamCache.delete(firstKey);
                        }
                        streamCache.set(cacheKey, {
                            data: vData as StreamData,
                            expiresAt: Date.now() + 3 * 60 * 1000,
                        });
                        return vData as StreamData;
                    }
                }
            }
        } catch {
            // Ignore Vercel API errors and proceed to web play fallback
        }

        // 0.5. Web Play endpoint — same as official h5.aoneroom.com player uses
        try {
            const STREAM_BASE = "https://h5.aoneroom.com/wefeed-h5-bff";
            const reqSeason = season > 0 ? season : 0;
            const reqEpisode = episode > 0 ? episode : 0;
            const playUrl = `${STREAM_BASE}/web/subject/play?subjectId=${path.split("-").pop() || path}&se=${reqSeason}&ep=${reqEpisode}&detailPath=${encodeURIComponent(path)}`;

            // We need the subjectId. Try to extract from path or fetch details
            let subjectId = "";
            let resolvedDetailPath = path;
            try {
                const detailsForId = await movieService.getDetails(path, adult);
                subjectId = detailsForId?.subject?.subjectId || "";
                if (detailsForId?.subject?.detailPath) {
                    resolvedDetailPath = detailsForId.subject.detailPath;
                }
            } catch {
                /* ignore */
            }

            if (subjectId) {
                const realPlayUrl = `${STREAM_BASE}/web/subject/play?subjectId=${subjectId}&se=${reqSeason}&ep=${reqEpisode}&detailPath=${encodeURIComponent(resolvedDetailPath)}`;
                const playerReferer = `https://h5.aoneroom.com/spa/videoPlayPage/movies/${resolvedDetailPath}?id=${subjectId}&lang=en`;

                const playController = new AbortController();
                const playTimeout = setTimeout(
                    () => playController.abort(),
                    8000,
                );
                const playRes = await fetch(realPlayUrl, {
                    headers: {
                        "User-Agent":
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
                        Accept: "application/json, text/plain, */*",
                        Origin: "https://h5.aoneroom.com",
                        Referer: playerReferer,
                    },
                    signal: playController.signal,
                    cache: "no-store",
                });
                clearTimeout(playTimeout);

                if (playRes.ok) {
                    const playJson: any = await playRes.json();
                    const playData = playJson.data || playJson;
                    const streams = playData.streams || [];
                    const downloads: DownloadLink[] = [];

                    for (const s of streams) {
                        const sUrl = s.url || "";
                        if (sUrl && sUrl.startsWith("http")) {
                            downloads.push({
                                id: String(s.id || downloads.length),
                                url: sUrl,
                                resolution:
                                    s.resolutions || s.resolution || 720,
                                size: s.size || 0,
                            });
                        }
                    }

                    // Also check downloadList
                    for (const key of [
                        "downloadList",
                        "resourceList",
                        "downloads",
                    ]) {
                        const rawList = playData[key] || [];
                        for (const d of rawList) {
                            const dUrl =
                                d.url || d.resourceLink || d.sourceUrl || "";
                            if (dUrl && dUrl.startsWith("http")) {
                                downloads.push({
                                    id: String(
                                        d.id ||
                                            d.resourceId ||
                                            downloads.length,
                                    ),
                                    url: dUrl,
                                    resolution: d.resolution || 720,
                                    size: d.size || 0,
                                });
                            }
                        }
                    }

                    if (downloads.length > 0) {
                        const parseResNum = (r: any) => {
                            const val = parseInt(String(r).replace(/\D/g, ""), 10);
                            return isNaN(val) ? 0 : val;
                        };
                        const uniqueMap = new Map<number, DownloadLink>();
                        for (const d of downloads) {
                            const r = parseResNum(d.resolution);
                            const existing = uniqueMap.get(r);
                            if (!existing || (Number(d.size) || 0) > (Number(existing.size) || 0)) {
                                uniqueMap.set(r, { ...d, resolution: r });
                            }
                        }
                        const sortedDownloads = Array.from(uniqueMap.values()).sort(
                            (a, b) => parseResNum(b.resolution) - parseResNum(a.resolution),
                        );

                        const rawCaptions =
                            playData.captions ||
                            playData.captionList ||
                            playData.subtitles ||
                            playData.subtitleList ||
                            playData.subs ||
                            [];
                        const captions: Caption[] = rawCaptions
                            .map((c: any, idx: number) => {
                                const cUrl =
                                    c.url ||
                                    c.link ||
                                    c.subUrl ||
                                    c.subtitleUrl ||
                                    "";
                                if (!cUrl) return null;
                                return {
                                    id: String(c.id || idx),
                                    lan: c.lan || c.language || c.lang || "en",
                                    lanName:
                                        c.lanName ||
                                        c.languageName ||
                                        c.langName ||
                                        c.name ||
                                        "English",
                                    url: cUrl,
                                };
                            })
                            .filter(Boolean) as Caption[];

                        const result: StreamData = {
                            downloads: sortedDownloads,
                            captions,
                            hasResource: true,
                            limited: false,
                            limitedCode: "",
                            stream_domain: "https://h5.aoneroom.com",
                        };
                        const finalResult = await ensureCaptions(
                            result,
                            path,
                            subjectId,
                            season,
                            episode,
                            adult,
                        );
                        streamCache.set(cacheKey, {
                            data: finalResult,
                            expiresAt: Date.now() + 3 * 60 * 1000,
                        });
                        return finalResult;
                    }
                }
            }
        } catch {
            // Web play fallback failed — continue to mirror fallback
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

        const canonicalPath = subject.detailPath || path;

        // ── TIER 1: Race ALL mirrors in parallel (use Promise.any to get first success) ──
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
                                canonicalPath,
                                sAtt,
                                eAtt,
                                adult,
                            ),
                        );
                    }
                }
            }
        }

        const validTask = async (
            task: Promise<StreamData | null>,
        ): Promise<StreamData> => {
            const res = await task;
            if (
                res &&
                res.hasResource &&
                (res.downloads.length > 0 || res.captions.length > 0)
            ) {
                return res;
            }
            throw new Error("No stream links in mirror response");
        };

        try {
            const valid = await Promise.any(
                tier1Tasks.map((t) => validTask(t)),
            );
            if (valid) {
                const finalValid = await ensureCaptions(
                    valid,
                    canonicalPath,
                    subject.subjectId,
                    season,
                    episode,
                    adult,
                );
                if (streamCache.size > 200) {
                    const firstKey = streamCache.keys().next().value;
                    if (firstKey) streamCache.delete(firstKey);
                }
                streamCache.set(cacheKey, {
                    data: finalValid,
                    expiresAt: Date.now() + 3 * 60 * 1000,
                });
                return finalValid;
            }
        } catch {
            // Fallthrough to h5-api direct fallback
        }

        // ── TIER 1.5: Direct h5-api.aoneroom.com web endpoint (fallback when mobile mirrors fail) ──
        try {
            const h5Base = "https://h5-api.aoneroom.com";
            const token = await getAuthToken();
            const spoofedIp = randomSpoofedIp();
            const h5Headers: Record<string, string> = {
                "User-Agent":
                    "Mozilla/5.0 (X11; Linux x86_64; rv:137.0) Gecko/20100101 Firefox/137.0",
                Accept: "*/*",
                "Accept-Language": "en-US,en;q=0.9",
                Referer: "https://videodownloader.site/",
                Origin: "https://videodownloader.site",
                "X-Forwarded-For": spoofedIp,
                "X-Real-IP": spoofedIp,
                ...(token
                    ? {
                          Authorization: `Bearer ${token}`,
                          Cookie: `token=${token}`,
                      }
                    : {}),
            };

            const reqSeason = season > 0 ? season : isEpisodic ? 1 : 0;
            const reqEpisode = episode > 0 ? episode : isEpisodic ? 1 : 0;
            const h5Url = `${h5Base}/wefeed-h5api-bff/subject/download?subjectId=${subject.subjectId}&se=${reqSeason}&ep=${reqEpisode}&detailPath=${encodeURIComponent(path)}`;

            const h5Controller = new AbortController();
            const h5Timeout = setTimeout(() => h5Controller.abort(), 6000);
            const h5Res = await fetch(h5Url, {
                headers: h5Headers,
                signal: h5Controller.signal,
                cache: "no-store",
            });
            clearTimeout(h5Timeout);

            if (h5Res.ok) {
                const h5Json: any = await h5Res.json();
                const h5Data = h5Json.data || h5Json;
                const rawDownloads =
                    h5Data.downloads ||
                    h5Data.downloadList ||
                    h5Data.resourceList ||
                    h5Data.sources ||
                    h5Data.playList ||
                    [];
                if (Array.isArray(rawDownloads) && rawDownloads.length > 0) {
                    const downloads = rawDownloads
                        .map((d: any, idx: number) => {
                            const rawUrl =
                                d.url ||
                                d.playUrl ||
                                d.downloadUrl ||
                                d.videoUrl ||
                                d.hlsUrl ||
                                d.resourceLink ||
                                d.sourceUrl ||
                                d.resource_link ||
                                d.source_url ||
                                d.fallbackUrl ||
                                d.link ||
                                (typeof d === "string" ? d : "");
                            if (
                                !rawUrl ||
                                typeof rawUrl !== "string" ||
                                !rawUrl.trim() ||
                                rawUrl.trim() === "None"
                            )
                                return null;
                            return {
                                id: String(d.id || d.resolution || idx),
                                url: rawUrl.trim(),
                                resolution: parseResolution(
                                    d.resolution || d.quality || d.name || 720,
                                ),
                                size: Number(d.size || d.fileSize || 0),
                                resource_link:
                                    d.resourceLink || d.resource_link || "",
                                source_url: d.sourceUrl || d.source_url || "",
                            };
                        })
                        .filter(Boolean) as DownloadLink[];

                    if (downloads.length > 0) {
                        const rawCaptions =
                            h5Data.captions ||
                            h5Data.captionList ||
                            h5Data.subtitles ||
                            h5Data.subtitleList ||
                            h5Data.subs ||
                            [];
                        const captions: Caption[] = rawCaptions
                            .map((c: any, idx: number) => {
                                const cUrl =
                                    c.url ||
                                    c.link ||
                                    c.subUrl ||
                                    c.subtitleUrl ||
                                    "";
                                if (
                                    !cUrl ||
                                    typeof cUrl !== "string" ||
                                    !cUrl.trim()
                                )
                                    return null;
                                return {
                                    id: String(c.id || idx),
                                    lan: c.lan || c.language || c.lang || "en",
                                    lanName:
                                        c.lanName ||
                                        c.languageName ||
                                        c.langName ||
                                        c.name ||
                                        c.lan ||
                                        "English",
                                    url: cUrl.trim(),
                                };
                            })
                            .filter((c: any): c is Caption => c !== null);

                        const result: StreamData = {
                            downloads,
                            captions,
                            hasResource: true,
                            limited: Boolean(h5Data.limited),
                            limitedCode: h5Data.limitedCode || "",
                            stream_domain: "https://videodownloader.site/",
                        };
                        const finalResult = await ensureCaptions(
                            result,
                            path,
                            subject.subjectId,
                            season,
                            episode,
                            adult,
                        );
                        streamCache.set(cacheKey, {
                            data: finalResult,
                            expiresAt: Date.now() + 3 * 60 * 1000,
                        });
                        return finalResult;
                    }
                }
            }
        } catch {
            // h5-api fallback failed — continue to dub tracks
        }

        // ── TIER 2: Fallback to dub tracks ──
        const dubs = details.dubs || [];
        for (const dub of dubs) {
            if (!dub.detailPath || dub.detailPath === path) continue;
            try {
                const dubDetails = await movieService.getDetails(
                    dub.detailPath,
                    adult,
                );
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
                    (r) =>
                        r &&
                        r.hasResource &&
                        (r.downloads.length > 0 || r.captions.length > 0),
                );
                if (dubValid) {
                    const finalDub = await ensureCaptions(
                        dubValid,
                        dub.detailPath,
                        dubSubject.subjectId,
                        season,
                        episode,
                        adult,
                    );
                    return finalDub;
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
