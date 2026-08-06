import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "Range, Content-Type",
            "Access-Control-Expose-Headers":
                "Content-Range, Content-Length, Accept-Ranges, Content-Type",
            "Access-Control-Max-Age": "86400",
        },
    });
}

export async function GET(req: NextRequest) {
    try {
        let url = "";
        const fullReqUrl = req.url;
        const urlParamIdx = fullReqUrl.indexOf("url=");
        if (urlParamIdx !== -1) {
            let rawVal = fullReqUrl.slice(urlParamIdx + 4);
            for (const delim of ["&referer=", "&mode="]) {
                const dIdx = rawVal.indexOf(delim);
                if (dIdx !== -1) {
                    rawVal = rawVal.slice(0, dIdx);
                }
            }
            try {
                url = decodeURIComponent(rawVal);
            } catch {
                url = rawVal;
            }
        }

        if (!url) {
            url = req.nextUrl.searchParams.get("url") || "";
        }

        if (!url) {
            return NextResponse.json(
                { detail: "Missing url parameter" },
                { status: 400, headers: { "Access-Control-Allow-Origin": "*" } },
            );
        }


        const rangeHeader = req.headers.get("range");

        let upstreamResp: Response | null = null;

        // Strategy 1: Vercel Proxy API (bypasses Cloudflare IP blocks and handles chunked video ranges)
        try {
            const vercelProxyUrl = `https://api.abisolutions.online/api/video?url=${encodeURIComponent(url)}`;
            const vercelHeaders: Record<string, string> = {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                Accept: "*/*",
            };
            if (rangeHeader) vercelHeaders["Range"] = rangeHeader;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2500);

            const res = await fetch(vercelProxyUrl, {
                headers: vercelHeaders,
                signal: controller.signal,
                cache: "no-store",
            });
            clearTimeout(timeoutId);
            if (res.ok || res.status === 206) {
                upstreamResp = res;
            }
        } catch {
            // Proceed to direct CDN fallback below
        }

        // Strategy 2: Direct fetch fallback
        if (!upstreamResp) {
            try {
                const directHeaders: Record<string, string> = {
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                    Accept: "*/*",
                    Referer: "https://videodownloader.site/",
                    Origin: "https://videodownloader.site/",
                };
                if (rangeHeader) directHeaders["Range"] = rangeHeader;

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3000);
                const res = await fetch(url, {
                    headers: directHeaders,
                    signal: controller.signal,
                    cache: "no-store",
                });
                clearTimeout(timeoutId);
                if (res.ok || res.status === 206) {
                    upstreamResp = res;
                }
            } catch {
                // Direct fetch failed
            }
        }

        if (!upstreamResp || (!upstreamResp.ok && upstreamResp.status !== 206)) {
            return NextResponse.json(
                { error: "cdn_rejected", status: upstreamResp?.status || 502 },
                { status: 502, headers: { "Access-Control-Allow-Origin": "*" } },
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
        if (!resHeaders.has("content-type")) resHeaders.set("content-type", "video/mp4");
        resHeaders.set("Access-Control-Allow-Origin", "*");
        resHeaders.set(
            "Access-Control-Expose-Headers",
            "Content-Range, Content-Length, Accept-Ranges, Content-Type",
        );
        resHeaders.set("Cache-Control", "public, max-age=3600, s-maxage=3600");

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
