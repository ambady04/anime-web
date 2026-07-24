import { NextRequest, NextResponse } from "next/server";

// Video stream proxy — fetches video from CDN with the correct Referer header.
// The CDN requires a specific Referer that browsers cannot set on <video> requests.
// This route runs on the Cloudflare Worker edge (same origin as the frontend).
export const dynamic = "force-dynamic";

const REFERER_POOL = [
    "https://videodownloader.site/",
    "https://h5.aoneroom.com/",
    "https://moviebox.ph/",
    "https://www.movieboxpro.app/",
    "https://fmoviesunblocked.net/",
];

// Handle CORS preflight
export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "Range, Content-Type",
            "Access-Control-Expose-Headers":
                "Content-Range, Content-Length, Accept-Ranges",
            "Access-Control-Max-Age": "86400",
        },
    });
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = req.nextUrl;
        const targetUrl = searchParams.get("url");

        if (!targetUrl) {
            return new NextResponse("Missing url parameter", { status: 400 });
        }

        // Validate URL
        try {
            new URL(targetUrl);
        } catch {
            return NextResponse.json(
                { error: "invalid_url", message: "Invalid target URL format" },
                {
                    status: 400,
                    headers: { "Access-Control-Allow-Origin": "*" },
                },
            );
        }

        const clientReferer = searchParams.get("referer");
        const range = req.headers.get("range");

        // Build referer rotation list:
        // 1. Client-specified referer with browser UA
        // 2. Pool referers with browser UA
        // 3. No referer with Lavf UA (works for some CDNs)
        // 4. No referer with browser UA
        const referersToTry: { referer: string | null; ua: string }[] = [];

        if (clientReferer) {
            referersToTry.push({
                referer: clientReferer,
                ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            });
        }

        for (const ref of REFERER_POOL) {
            if (ref !== clientReferer) {
                referersToTry.push({
                    referer: ref,
                    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                });
            }
        }

        // Fallbacks with no referer
        referersToTry.push({ referer: null, ua: "Lavf/58.29.100" });
        referersToTry.push({
            referer: null,
            ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        });

        let lastStatus = 0;
        let lastError = "";

        for (const { referer, ua } of referersToTry) {
            try {
                let origin = "https://videodownloader.site";
                if (referer) {
                    try {
                        origin = new URL(referer).origin;
                    } catch {
                        try {
                            origin = new URL(
                                referer.includes("://")
                                    ? referer
                                    : `https://${referer}`,
                            ).origin;
                        } catch {
                            // Use default
                        }
                    }
                }

                const reqHeaders: Record<string, string> = {
                    "User-Agent": ua,
                    Accept: "video/mp4,video/*;q=0.9,*/*;q=0.8",
                    "Accept-Encoding": "identity",
                };
                if (referer) {
                    reqHeaders["Referer"] = referer;
                    reqHeaders["Origin"] = origin;
                }
                if (range) {
                    reqHeaders["Range"] = range;
                }

                const upstream = await fetch(targetUrl, {
                    method: "GET",
                    headers: reqHeaders,
                    redirect: "follow",
                });
                lastStatus = upstream.status;

                // Skip to next referer on failures
                if ([403, 404, 410, 428, 429].includes(upstream.status)) {
                    continue;
                }
                if (upstream.status >= 500) {
                    continue;
                }

                // Success — build response headers
                const resHeaders = new Headers();
                const forwardHeaders = [
                    "content-type",
                    "content-length",
                    "content-range",
                    "accept-ranges",
                    "etag",
                    "last-modified",
                ];
                for (const h of forwardHeaders) {
                    const v = upstream.headers.get(h);
                    if (v) resHeaders.set(h, v);
                }

                if (!resHeaders.has("accept-ranges")) {
                    resHeaders.set("accept-ranges", "bytes");
                }
                if (!resHeaders.has("content-type")) {
                    resHeaders.set("content-type", "video/mp4");
                }

                // Support download mode
                const download = searchParams.get("download");
                const filename = searchParams.get("filename");
                if (download === "true" || filename) {
                    const safeFilename = (filename || "video.mp4")
                        .replace(/["\\]/g, "")
                        .replace(/[^\x20-\x7E]/g, "_");
                    resHeaders.set(
                        "Content-Disposition",
                        `attachment; filename="${safeFilename}"`,
                    );
                }

                resHeaders.set("Access-Control-Allow-Origin", "*");
                resHeaders.set(
                    "Access-Control-Expose-Headers",
                    "Content-Range, Content-Length, Accept-Ranges, Content-Type",
                );
                resHeaders.set(
                    "Cache-Control",
                    "public, max-age=3600, s-maxage=3600",
                );

                return new NextResponse(upstream.body, {
                    status: upstream.status,
                    headers: resHeaders,
                });
            } catch (err: unknown) {
                lastError =
                    err instanceof Error ? err.message : "Unknown fetch error";
                continue;
            }
        }

        // All referers failed — try Vercel backend as ultimate fallback
        try {
            const vercelUrl = `https://api.abisolutions.online/api/video?${searchParams.toString()}`;
            const vercelHeaders: Record<string, string> = {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                Accept: "video/mp4,video/*;q=0.9,*/*;q=0.8",
            };
            if (range) {
                vercelHeaders["Range"] = range;
            }

            const vercelResp = await fetch(vercelUrl, {
                headers: vercelHeaders,
                redirect: "follow",
            });

            if (vercelResp.ok || vercelResp.status === 206) {
                const resHeaders = new Headers();
                const forwardHeaders = [
                    "content-type",
                    "content-length",
                    "content-range",
                    "accept-ranges",
                    "etag",
                    "last-modified",
                ];
                for (const h of forwardHeaders) {
                    const v = vercelResp.headers.get(h);
                    if (v) resHeaders.set(h, v);
                }
                if (!resHeaders.has("accept-ranges")) {
                    resHeaders.set("accept-ranges", "bytes");
                }
                if (!resHeaders.has("content-type")) {
                    resHeaders.set("content-type", "video/mp4");
                }
                resHeaders.set("Access-Control-Allow-Origin", "*");
                resHeaders.set(
                    "Access-Control-Expose-Headers",
                    "Content-Range, Content-Length, Accept-Ranges, Content-Type",
                );
                resHeaders.set(
                    "Cache-Control",
                    "public, max-age=3600, s-maxage=3600",
                );
                return new NextResponse(vercelResp.body, {
                    status: vercelResp.status,
                    headers: resHeaders,
                });
            }
        } catch {
            // Vercel fallback also failed — continue to error response
        }

        // Everything failed
        if ([403, 404, 410, 428].includes(lastStatus)) {
            return NextResponse.json(
                {
                    error: "cdn_rejected",
                    cdnStatus: lastStatus,
                    tried: referersToTry.length,
                    message:
                        "CDN rejected all referer attempts. Stream token may have expired.",
                },
                {
                    status: 422,
                    headers: { "Access-Control-Allow-Origin": "*" },
                },
            );
        }

        return NextResponse.json(
            {
                error: "proxy_error",
                message: lastError || "Stream unavailable from all mirrors",
                cdnStatus: lastStatus || 502,
            },
            { status: 502, headers: { "Access-Control-Allow-Origin": "*" } },
        );
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Internal proxy error";
        return NextResponse.json(
            { error: "internal_error", message: msg },
            { status: 500, headers: { "Access-Control-Allow-Origin": "*" } },
        );
    }
}
