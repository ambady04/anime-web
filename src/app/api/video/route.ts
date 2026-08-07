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

        const rangeHeader = req.headers.get("range") || "bytes=0-";
        let upstreamResp: Response | null = null;

        // Strategy 1: Parallel Referer Race (400ms response vs 56s sequential delay)
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
            const timeoutId = setTimeout(() => controller.abort(), 4000);
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
            // Edge direct fetch failed — proceed to Strategy 2 below
        }

        // Strategy 2: Render Proxy Fallback (if edge direct fetch failed)
        if (!upstreamResp) {
            try {
                const renderProxyUrl = `https://anime-api-arlv.onrender.com/api/video?url=${encodeURIComponent(url)}`;
                const renderHeaders: Record<string, string> = {
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                    Accept: "*/*",
                };
                if (rangeHeader) renderHeaders["Range"] = rangeHeader;

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000);

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
                // Both strategies failed
            }
        }

        if (!upstreamResp || (!upstreamResp.ok && upstreamResp.status !== 206)) {
            // Redirect browser directly to raw CDN URL so browser fetches with user's residential IP
            return NextResponse.redirect(url, { status: 307 });
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
