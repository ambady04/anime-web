import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
// Streaming video — ensure no body size limit truncates the response
export const maxDuration = 60;

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Content-Type, Authorization",
    "Access-Control-Expose-Headers":
        "Content-Range, Content-Length, Accept-Ranges, Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
};

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: CORS_HEADERS,
    });
}

export async function HEAD(req: NextRequest) {
    // Some video players send a HEAD request first to check content-length/type.
    // Forward it to the same GET logic but strip the body.
    const getResponse = await GET(req);
    return new NextResponse(null, {
        status: getResponse.status,
        headers: getResponse.headers,
    });
}

export async function GET(req: NextRequest) {
    try {
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
            return NextResponse.json(
                { detail: "Missing url parameter" },
                { status: 400, headers: { "Access-Control-Allow-Origin": "*" } },
            );
        }

        const rangeHeader = req.headers.get("range") || "bytes=0-";
        const referer = req.nextUrl.searchParams.get("referer") || "https://videodownloader.site/";
        const mode = req.nextUrl.searchParams.get("mode") || "stream";
        const quality = req.nextUrl.searchParams.get("quality") || "";
        let upstreamResp: Response | null = null;

        const USER_AGENTS = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
        ];

        // Build candidate CDN URLs: try bcdn first, then cacdn
        const urlsToTry: string[] = [url];
        if (url.includes("hakunaymatata.com")) {
            try {
                const hostPart = url.split("://")[1].split("/")[0];
                const currentSub = hostPart.split(".hakunaymatata.com")[0];
                for (const sub of ["bcdnxw", "bcdn", "cacdn"]) {
                    if (sub !== currentSub) {
                        const alt = url.replace(`://${currentSub}.hakunaymatata.com`, `://${sub}.hakunaymatata.com`);
                        if (!urlsToTry.includes(alt)) urlsToTry.push(alt);
                    }
                }
            } catch {
                // Ignore parse errors
            }
        }

        // Strategy 1: Direct fetch from Vercel edge/serverless with primary Referer candidates & Range
        const refererCandidates = [
            referer || "https://videodownloader.site/",
            "https://videodownloader.site/",
            "https://h5.aoneroom.com/",
        ];

        const tried = new Set<string>();
        outer: for (const targetUrl of urlsToTry) {
            for (const ref of refererCandidates) {
                const key = `${targetUrl}|${ref}`;
                if (tried.has(key)) continue;
                tried.add(key);

                const directHeaders: Record<string, string> = {
                    "User-Agent": USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
                    Accept: "*/*",
                    "Accept-Encoding": "identity",
                    "Accept-Language": "en-US,en;q=0.9",
                    Referer: ref,
                    Origin: ref.replace(/\/$/, ""),
                    "Sec-Fetch-Dest": "video",
                    "Sec-Fetch-Mode": "cors",
                    "Sec-Fetch-Site": "cross-site",
                    Range: rangeHeader,
                };

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 12000);
                try {
                    const res = await fetch(targetUrl, {
                        headers: directHeaders,
                        signal: controller.signal,
                        cache: "no-store",
                    });
                    clearTimeout(timeoutId);
                    if (res.ok || res.status === 206) {
                        upstreamResp = res;
                        break outer;
                    }
                    if (res.status === 429) {
                        // Rate limited on this domain — break to try alt domain candidate
                        break;
                    }
                } catch {
                    clearTimeout(timeoutId);
                }
            }
        }

        // Strategy 2: Render backend proxy fallback with Range headers
        if (!upstreamResp) {
            try {
                const renderBase = (
                    process.env.NEXT_PUBLIC_API_URL || "https://anime-api-arlv.onrender.com"
                ).replace(/\/+$/, "");
                // Pass the primary (bcdn non-xw) URL to the Render backend too
                const proxyUrl = urlsToTry[0] || url;
                const renderProxyUrl = `${renderBase}/api/video?url=${encodeURIComponent(proxyUrl)}&referer=${encodeURIComponent(referer)}&mode=${mode}&quality=${quality}&range=${encodeURIComponent(rangeHeader)}`;
                const renderHeaders: Record<string, string> = {
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                    Accept: "*/*",
                    // Pass Range both as HTTP header AND query param (backend reads from header)
                    Range: rangeHeader,
                };

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 20000);

                const res = await fetch(renderProxyUrl, {
                    headers: renderHeaders,
                    signal: controller.signal,
                    cache: "no-store",
                });
                clearTimeout(timeoutId);

                if (res.ok || res.status === 206) {
                    upstreamResp = res;
                }
            } catch {
                // Backend proxy unavailable
            }
        }

        if (!upstreamResp || (!upstreamResp.ok && upstreamResp.status !== 206)) {
            return NextResponse.json(
                {
                    error: "video_proxy_failed",
                    message: "All proxy strategies failed. Stream URLs may have expired — please refresh.",
                },
                {
                    status: 502,
                    headers: { "Access-Control-Allow-Origin": "*" },
                },
            );
        }

        const resHeaders = new Headers();
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

        if (!resHeaders.has("accept-ranges")) resHeaders.set("accept-ranges", "bytes");
        if (!resHeaders.has("content-type") || mode === "stream") resHeaders.set("content-type", mode === "subtitle" ? "text/vtt" : "video/mp4");
        // Apply CORS headers
        Object.entries(CORS_HEADERS).forEach(([k, v]) => resHeaders.set(k, v));
        resHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0");
        resHeaders.set("Pragma", "no-cache");
        resHeaders.set("Expires", "0");

        // Explicitly omit Content-Disposition header so browser plays stream inline without download prompt / rejection
        resHeaders.delete("content-disposition");

        return new NextResponse(upstreamResp.body, {
            status: upstreamResp.status,
            headers: resHeaders,
        });

    } catch (err: any) {
        return NextResponse.json(
            { error: "video_proxy_failed", message: err?.message || String(err) },
            { status: 500, headers: { "Access-Control-Allow-Origin": "*" } },
        );
    }
}
