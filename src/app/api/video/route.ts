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
        const url = req.nextUrl.searchParams.get("url") || "";

        if (!url) {
            return NextResponse.json(
                { detail: "Missing url parameter" },
                { status: 400, headers: { "Access-Control-Allow-Origin": "*" } },
            );
        }

        const rangeHeader = req.headers.get("range") || "";
        const referer = req.nextUrl.searchParams.get("referer") || "https://videodownloader.site/";
        const mode = req.nextUrl.searchParams.get("mode") || "stream";
        const quality = req.nextUrl.searchParams.get("quality") || "";
        let upstreamResp: Response | null = null;

        // Strategy 1: Route through Render backend proxy.
        // The Render backend has the authenticated MovieBox session (account+token cookies)
        // which are required to access CloudFront-protected CDN URLs.
        // This MUST be the primary strategy — direct CDN fetch from Vercel/Cloudflare IPs
        // will fail for cookie-auth CloudFront URLs, causing MissingKey errors.
        try {
            const renderBase = (process.env.NEXT_PUBLIC_API_URL || "https://anime-api-arlv.onrender.com").replace(/\/+$/, "");
            const renderProxyUrl = `${renderBase}/api/video?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}&mode=${mode}&quality=${quality}`;
            const renderHeaders: Record<string, string> = {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                Accept: "*/*",
            };
            if (rangeHeader) renderHeaders["Range"] = rangeHeader;

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
            // Render backend unavailable — fall through to Strategy 2
        }

        // Strategy 2: Direct CDN fetch with referer rotation (for non-CloudFront / publicly accessible URLs)
        // Skipped for CloudFront domains since they require session cookies the Vercel edge doesn't have.
        const isCloudfrontUrl = url.includes("cacdn.hakunaymatata.com") ||
            url.includes("cloudfront.net") ||
            (url.includes("Policy=") && url.includes("Signature="));

        if (!upstreamResp && !isCloudfrontUrl) {
            const refererCandidates = [
                "https://videodownloader.site/",
                "https://moviebox.ph/",
                "https://fmoviesunblocked.net/",
                "https://h5.aoneroom.com/",
            ];

            const refererTasks = refererCandidates.map(async (ref) => {
                const directHeaders: Record<string, string> = {
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                    Accept: "*/*",
                    Referer: ref,
                    Origin: ref.replace(/\/+$/, ""),
                };
                if (rangeHeader) directHeaders["Range"] = rangeHeader;

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);
                try {
                    const res = await fetch(url, {
                        headers: directHeaders,
                        signal: controller.signal,
                        cache: "no-store",
                    });
                    clearTimeout(timeoutId);
                    if (res.ok || res.status === 206) return res;
                    throw new Error(`Status ${res.status}`);
                } catch (err) {
                    clearTimeout(timeoutId);
                    throw err;
                }
            });

            try {
                upstreamResp = await Promise.any(refererTasks);
            } catch {
                // All direct fetches failed
            }
        }

        if (!upstreamResp || (!upstreamResp.ok && upstreamResp.status !== 206)) {
            // All proxy strategies failed.
            // Return 502 so the video player knows to refresh stream URLs.
            // DO NOT redirect (307) — CloudFront cookie-protected URLs will return
            // "MissingKey" if the browser hits them without session auth cookies.
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
