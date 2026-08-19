import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
// Streaming video — ensure no body size limit truncates the response
export const maxDuration = 60;

const CORS_HEADERS: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Content-Type, Authorization",
    "Access-Control-Expose-Headers":
        "Content-Range, Content-Length, Accept-Ranges, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
};

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

const USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
];

// Attempt a single upstream fetch with timeout
async function tryFetch(
    targetUrl: string,
    headers: Record<string, string>,
    timeoutMs = 15000,
): Promise<Response | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(targetUrl, {
            headers,
            signal: controller.signal,
            redirect: "follow",
            cache: "no-store",
        });
        clearTimeout(timeoutId);
        if (res.ok || res.status === 206) {
            return res;
        }
        // Consume body to release connection
        await res.body?.cancel().catch(() => {});
        return null;
    } catch {
        clearTimeout(timeoutId);
        return null;
    }
}

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: CORS_HEADERS,
    });
}

export async function HEAD(req: NextRequest) {
    const getResponse = await GET(req);
    return new NextResponse(null, {
        status: getResponse.status,
        headers: getResponse.headers,
    });
}

export async function GET(req: NextRequest) {
    try {
        // ─── Parse URL parameter ───
        const fullReqUrl = req.url;
        let url = "";
        if (fullReqUrl.includes("url=")) {
            const afterUrl = fullReqUrl.slice(fullReqUrl.indexOf("url=") + 4);
            let cutIndex = afterUrl.length;
            for (const p of ["&referer=", "&mode=", "&quality=", "&_t="]) {
                const idx = afterUrl.indexOf(p);
                if (idx !== -1 && idx < cutIndex) {
                    cutIndex = idx;
                }
            }
            const rawVal = afterUrl.slice(0, cutIndex);
            try {
                url = decodeURIComponent(rawVal);
            } catch {
                url = rawVal;
            }
            if (!url.startsWith("http")) {
                url = req.nextUrl.searchParams.get("url") || "";
            }
        } else {
            url = req.nextUrl.searchParams.get("url") || "";
        }

        if (!url) {
            // ─── Live resolve mode: fetch fresh stream URL then proxy ───
            const pathParam = req.nextUrl.searchParams.get("path") || "";
            const seasonParam = req.nextUrl.searchParams.get("season") || "0";
            const episodeParam = req.nextUrl.searchParams.get("episode") || "0";
            const qualityParam = req.nextUrl.searchParams.get("quality") || "";

            if (!pathParam) {
                return NextResponse.json(
                    { detail: "Missing url or path parameter" },
                    { status: 400, headers: CORS_HEADERS },
                );
            }

            // Resolve fresh stream URL server-side
            try {
                const { streamService } =
                    await import("@/lib/server/stream-service");
                const streamData = await streamService.getStream(
                    pathParam,
                    parseInt(seasonParam, 10),
                    parseInt(episodeParam, 10),
                    false,
                );

                if (
                    !streamData.downloads ||
                    streamData.downloads.length === 0
                ) {
                    return NextResponse.json(
                        {
                            error: "no_streams",
                            message:
                                "No stream URLs available for this content",
                        },
                        { status: 404, headers: CORS_HEADERS },
                    );
                }

                // Pick the best quality match
                const targetQuality = parseInt(qualityParam, 10) || 0;
                let pick = streamData.downloads[0]; // default: first (highest)
                if (targetQuality > 0) {
                    const match = streamData.downloads.find(
                        (d: any) => (d.resolution || 0) === targetQuality,
                    );
                    if (match) pick = match;
                }
                url = pick.url;
            } catch (resolveErr) {
                return NextResponse.json(
                    {
                        error: "stream_resolve_failed",
                        message: String(resolveErr),
                    },
                    { status: 502, headers: CORS_HEADERS },
                );
            }
        }

        const rangeHeader = req.headers.get("range") || "";
        const referer =
            req.nextUrl.searchParams.get("referer") ||
            "https://videodownloader.site/";
        const mode = req.nextUrl.searchParams.get("mode") || "stream";
        const quality = req.nextUrl.searchParams.get("quality") || "";

        // ─── Build candidate CDN URLs (max 4 variants) ───
        const urlsToTry: string[] = [url];
        if (url.includes("hakunaymatata.com")) {
            try {
                const bcdnxwAlt = url.replace(
                    /:\/\/[^/]+\.hakunaymatata\.com/,
                    "://bcdnxw.hakunaymatata.com",
                );
                if (!urlsToTry.includes(bcdnxwAlt)) urlsToTry.push(bcdnxwAlt);
                const bcdnAlt = url.replace(
                    /:\/\/[^/]+\.hakunaymatata\.com/,
                    "://bcdn.hakunaymatata.com",
                );
                if (!urlsToTry.includes(bcdnAlt)) urlsToTry.push(bcdnAlt);
                const cacdnAlt = url.replace(
                    /:\/\/[^/]+\.hakunaymatata\.com/,
                    "://cacdn.hakunaymatata.com",
                );
                if (!urlsToTry.includes(cacdnAlt)) urlsToTry.push(cacdnAlt);
            } catch {
                /* ignore URL parse errors */
            }
        }

        const spoofedIp = randomSpoofedIp();
        const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

        // Referers ordered by likelihood to work
        const refererCandidates = [
            referer,
            "https://videodownloader.site/",
            "https://h5.aoneroom.com/",
        ];

        let upstreamResp: Response | null = null;

        // ─── Strategy 1: Direct fetch with referer spoofing ───
        // Limit to 2 URL variants × 2 referers to stay within Cloudflare subrequest budget
        const maxDirectAttempts = 4;
        let directAttempts = 0;

        for (const targetUrl of urlsToTry.slice(0, 2)) {
            if (upstreamResp) break;
            for (const ref of refererCandidates.slice(0, 2)) {
                if (directAttempts >= maxDirectAttempts) break;
                directAttempts++;

                const headers: Record<string, string> = {
                    "User-Agent": ua,
                    Accept: "*/*",
                    "Accept-Encoding": "identity",
                    "Accept-Language": "en-US,en;q=0.9",
                    Referer: ref,
                    Origin: ref.replace(/\/$/, ""),
                    "Sec-Fetch-Dest": "video",
                    "Sec-Fetch-Mode": "no-cors",
                    "Sec-Fetch-Site": "cross-site",
                    "X-Forwarded-For": spoofedIp,
                    "X-Real-IP": spoofedIp,
                    "Client-IP": spoofedIp,
                };
                if (rangeHeader) headers["Range"] = rangeHeader;

                upstreamResp = await tryFetch(targetUrl, headers, 15000);
                if (upstreamResp) break;
            }
        }

        // ─── Strategy 2: Render backend proxy ───
        if (!upstreamResp) {
            const renderBase = (
                process.env.NEXT_PUBLIC_API_URL ||
                "https://anime-api-arlv.onrender.com"
            ).replace(/\/+$/, "");

            for (const targetUrl of urlsToTry.slice(0, 2)) {
                const renderProxyUrl = `${renderBase}/api/video?url=${encodeURIComponent(targetUrl)}&referer=${encodeURIComponent(referer)}&mode=${mode}&quality=${quality}${rangeHeader ? `&range=${encodeURIComponent(rangeHeader)}` : ""}`;
                const headers: Record<string, string> = {
                    "User-Agent": ua,
                    Accept: "*/*",
                };
                if (rangeHeader) headers["Range"] = rangeHeader;

                upstreamResp = await tryFetch(renderProxyUrl, headers, 15000);
                if (upstreamResp) break;
            }
        }

        // ─── Strategy 3: Direct CDN without spoofing (last resort) ───
        if (!upstreamResp) {
            for (const targetUrl of urlsToTry) {
                const headers: Record<string, string> = {
                    "User-Agent": ua,
                    Accept: "*/*",
                    Referer: "https://videodownloader.site/",
                };
                if (rangeHeader) headers["Range"] = rangeHeader;

                upstreamResp = await tryFetch(targetUrl, headers, 12000);
                if (upstreamResp) break;
            }
        }

        // ─── All strategies exhausted ───
        if (!upstreamResp) {
            return NextResponse.json(
                {
                    error: "video_proxy_failed",
                    message:
                        "All proxy strategies failed. Stream URLs may have expired — please refresh.",
                },
                { status: 502, headers: CORS_HEADERS },
            );
        }

        // ─── Build response headers ───
        const resHeaders = new Headers();

        // Forward essential media headers from upstream
        for (const h of [
            "content-type",
            "content-range",
            "content-length",
            "accept-ranges",
            "etag",
            "last-modified",
        ]) {
            const v = upstreamResp.headers.get(h);
            if (v) resHeaders.set(h, v);
        }

        // Ensure Accept-Ranges is always present for seekable playback
        if (!resHeaders.has("accept-ranges")) {
            resHeaders.set("accept-ranges", "bytes");
        }

        // Set content-type: prefer upstream's actual type, fall back to mp4 for video streams
        if (!resHeaders.has("content-type")) {
            if (mode === "subtitle") {
                resHeaders.set("content-type", "text/vtt");
            } else {
                resHeaders.set("content-type", "video/mp4");
            }
        }

        // Apply CORS headers
        for (const [k, v] of Object.entries(CORS_HEADERS)) {
            resHeaders.set(k, v);
        }

        // Prevent caching of proxied streams (CDN tokens expire)
        resHeaders.set(
            "Cache-Control",
            "no-cache, no-store, must-revalidate, max-age=0",
        );
        resHeaders.set("Pragma", "no-cache");
        resHeaders.set("Expires", "0");

        // Remove Content-Disposition to prevent download prompts
        resHeaders.delete("content-disposition");

        return new NextResponse(upstreamResp.body, {
            status: upstreamResp.status,
            headers: resHeaders,
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json(
            { error: "video_proxy_failed", message },
            { status: 500, headers: CORS_HEADERS },
        );
    }
}
