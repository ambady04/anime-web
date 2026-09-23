/**
 * Cloudflare Worker — Video Proxy with Live Stream Resolution
 *
 * Two modes:
 * 1. Live-resolve: GET /?path=<detailPath>&season=<n>&episode=<n>&quality=<res>
 *    - Fetches fresh stream URLs from the API
 *    - Picks the best quality match
 *    - Proxies the video stream back to the client
 *
 * 2. Direct proxy: GET /?url=<encoded_cdn_url>&referer=<referer>
 *    - Proxies a specific URL (for subtitles, etc.)
 */

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Content-Type",
    "Access-Control-Expose-Headers":
        "Content-Range, Content-Length, Accept-Ranges, Content-Type",
};

const STREAM_BASE = "https://h5.aoneroom.com/wefeed-h5-bff";
const DETAIL_BASE = "https://h5-api.aoneroom.com/wefeed-h5api-bff";

const USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function getSubjectId(path) {
    const resp = await fetch(
        `${DETAIL_BASE}/detail?detailPath=${encodeURIComponent(path)}`,
        {
            headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        },
    );
    if (!resp.ok) return null;
    const json = await resp.json();
    const data = json.data || json;
    return data?.subject?.subjectId || null;
}

async function getStreamUrls(subjectId, path, season, episode) {
    const se = season || 0;
    const ep = episode || 0;
    const attempts =
        se > 0 || ep > 0
            ? [[se, ep]]
            : [
                  [0, 0],
                  [1, 1],
              ];

    for (const [s, e] of attempts) {
        const playUrl = `${STREAM_BASE}/web/subject/play?subjectId=${subjectId}&se=${s}&ep=${e}&detailPath=${encodeURIComponent(path)}`;
        const referer = `https://h5.aoneroom.com/spa/videoPlayPage/movies/${path}?id=${subjectId}&lang=en`;

        try {
            const resp = await fetch(playUrl, {
                headers: {
                    "User-Agent": USER_AGENT,
                    Accept: "application/json, text/plain, */*",
                    Origin: "https://h5.aoneroom.com",
                    Referer: referer,
                },
            });

            if (!resp.ok) continue;
            const json = await resp.json();
            const data = json.data || json;

            const downloads = [];

            // Check streams array
            for (const s of data.streams || []) {
                if (s.url && s.url.startsWith("http")) {
                    downloads.push({
                        url: s.url,
                        resolution: s.resolutions || s.resolution || 720,
                    });
                }
            }

            // Check downloadList / resourceList
            for (const key of ["downloadList", "resourceList", "downloads"]) {
                for (const d of data[key] || []) {
                    const url = d.url || d.resourceLink || d.sourceUrl || "";
                    if (url && url.startsWith("http")) {
                        downloads.push({
                            url: url,
                            resolution: d.resolution || 720,
                        });
                    }
                }
            }

            // Get captions
            const captions = [];
            for (const c of data.captions || data.captionList || []) {
                if (c.url) captions.push(c);
            }

            if (downloads.length > 0) {
                return { downloads, captions };
            }
        } catch (e) {
            continue;
        }
    }

    // Fallback: try mobile API
    const MOBILE_HOSTS = [
        "api6.aoneroom.com",
        "api5.aoneroom.com",
        "api4.aoneroom.com",
    ];
    for (const [s, e] of attempts) {
        for (const host of MOBILE_HOSTS) {
            for (const res of [1080, 720, 480]) {
                try {
                    const resp = await fetch(
                        `https://${host}/wefeed-mobile-bff/subject-api/resource?subjectId=${subjectId}&se=${s}&ep=${e}&resolution=${res}&page=1&perPage=10`,
                        {
                            headers: {
                                "User-Agent": USER_AGENT,
                                Accept: "application/json",
                            },
                        },
                    );
                    if (!resp.ok) continue;
                    const json = await resp.json();
                    const data = json.data || json;
                    const list = data.list || [];
                    const downloads = [];
                    for (const item of list) {
                        const url = item.resourceLink || item.sourceUrl || "";
                        if (url && url.startsWith("http") && url !== "None") {
                            downloads.push({
                                url,
                                resolution: item.resolution || res,
                            });
                        }
                    }
                    if (downloads.length > 0)
                        return { downloads, captions: [] };
                } catch {
                    continue;
                }
            }
        }
    }

    return null;
}

async function proxyVideo(targetUrl, referer, rangeHeader) {
    const headers = {
        "User-Agent": USER_AGENT,
        Accept: "*/*",
        "Accept-Encoding": "identity",
        Referer: referer,
        Origin: referer.replace(/\/$/, ""),
    };
    if (rangeHeader) headers["Range"] = rangeHeader;

    const resp = await fetch(targetUrl, { headers, redirect: "follow" });

    if (!resp.ok && resp.status !== 206) {
        // Try alternate referers
        for (const altRef of [
            "https://h5.aoneroom.com/",
            "https://www.google.com/",
        ]) {
            headers["Referer"] = altRef;
            headers["Origin"] = altRef.replace(/\/$/, "");
            const altResp = await fetch(targetUrl, {
                headers,
                redirect: "follow",
            });
            if (altResp.ok || altResp.status === 206) return altResp;
        }
        return null;
    }
    return resp;
}

export default {
    async fetch(request) {
        if (request.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: CORS_HEADERS });
        }

        const url = new URL(request.url);
        const targetUrl = url.searchParams.get("url");
        const path = url.searchParams.get("path");
        const season = parseInt(url.searchParams.get("season") || "0", 10);
        const episode = parseInt(url.searchParams.get("episode") || "0", 10);
        const quality = parseInt(url.searchParams.get("quality") || "0", 10);
        const referer =
            url.searchParams.get("referer") || "https://videodownloader.site/";
        const mode = url.searchParams.get("mode") || "stream";
        const rangeHeader = request.headers.get("Range") || "";

        try {
            let videoUrl = targetUrl;

            // Live-resolve mode: fetch fresh stream URL then proxy
            if (!videoUrl && path) {
                const subjectId = await getSubjectId(path);
                if (!subjectId) {
                    return new Response(
                        JSON.stringify({
                            error: "Could not resolve subjectId",
                        }),
                        {
                            status: 404,
                            headers: {
                                "Content-Type": "application/json",
                                ...CORS_HEADERS,
                            },
                        },
                    );
                }

                const streamData = await getStreamUrls(
                    subjectId,
                    path,
                    season,
                    episode,
                );
                if (!streamData || streamData.downloads.length === 0) {
                    return new Response(
                        JSON.stringify({ error: "No stream URLs found" }),
                        {
                            status: 404,
                            headers: {
                                "Content-Type": "application/json",
                                ...CORS_HEADERS,
                            },
                        },
                    );
                }

                // If mode is "info", return the stream data as JSON (for the frontend to use)
                if (mode === "info") {
                    return new Response(JSON.stringify(streamData), {
                        status: 200,
                        headers: {
                            "Content-Type": "application/json",
                            ...CORS_HEADERS,
                        },
                    });
                }

                // Pick quality
                const downloads = streamData.downloads.sort(
                    (a, b) => (b.resolution || 0) - (a.resolution || 0),
                );
                if (quality > 0) {
                    const match = downloads.find(
                        (d) => d.resolution === quality,
                    );
                    videoUrl = match ? match.url : downloads[0].url;
                } else {
                    videoUrl = downloads[0].url;
                }
            }

            if (!videoUrl) {
                return new Response(
                    JSON.stringify({ error: "Missing url or path parameter" }),
                    {
                        status: 400,
                        headers: {
                            "Content-Type": "application/json",
                            ...CORS_HEADERS,
                        },
                    },
                );
            }

            // Proxy the video/subtitle
            const upstream = await proxyVideo(videoUrl, referer, rangeHeader);
            if (!upstream) {
                return new Response(
                    JSON.stringify({ error: "CDN fetch failed" }),
                    {
                        status: 502,
                        headers: {
                            "Content-Type": "application/json",
                            ...CORS_HEADERS,
                        },
                    },
                );
            }

            const respHeaders = new Headers();
            for (const h of [
                "content-type",
                "content-range",
                "content-length",
                "accept-ranges",
            ]) {
                const v = upstream.headers.get(h);
                if (v) respHeaders.set(h, v);
            }
            Object.entries(CORS_HEADERS).forEach(([k, v]) =>
                respHeaders.set(k, v),
            );
            respHeaders.set("Accept-Ranges", "bytes");
            if (!respHeaders.has("Content-Type")) {
                respHeaders.set(
                    "Content-Type",
                    mode === "subtitle" ? "text/vtt" : "video/mp4",
                );
            }

            return new Response(upstream.body, {
                status: upstream.status,
                headers: respHeaders,
            });
        } catch (err) {
            return new Response(
                JSON.stringify({ error: err.message || "Internal error" }),
                {
                    status: 500,
                    headers: {
                        "Content-Type": "application/json",
                        ...CORS_HEADERS,
                    },
                },
            );
        }
    },
};
