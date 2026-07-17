import { NextRequest } from "next/server";

// Run at the Cloudflare edge (V8 isolate) — no Node.js overhead, fastest possible
// streaming response. This is the optimal runtime for a video proxy on Workers.
export const runtime = "edge";
export const dynamic = "force-dynamic";

// The CDN requires a specific Referer header. Cloudflare Workers may strip/override
// headers set via the `headers` option. To work around this, we construct the Request
// object explicitly with the headers baked in, which Workers respect.
const REFERER_POOL = [
    "https://videodownloader.site/",
    "https://h5.aoneroom.com/",
    "https://moviebox.ph/",
    "https://www.movieboxpro.app/",
    "https://fmoviesunblocked.net/",
];

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const targetUrl = searchParams.get("url");

        if (!targetUrl) {
            return new Response("Missing url parameter", { status: 400 });
        }

        // Quick URL format validation before entering the loop
        try {
            new URL(targetUrl);
        } catch {
            return new Response(
                JSON.stringify({ error: "invalid_url", message: "Invalid target URL format" }),
                {
                    status: 400,
                    headers: {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*",
                    },
                }
            );
        }

        const clientReferer = searchParams.get("referer");
        const range = req.headers.get("range");

        const referersToTry = clientReferer
            ? [
                  clientReferer,
                  ...REFERER_POOL.filter((r) => r !== clientReferer),
              ]
            : REFERER_POOL;

        let lastStatus = 0;
        let lastError = "";

        for (const referer of referersToTry) {
            try {
                // Safely extract origin to prevent TypeError: Invalid URL
                let origin = "https://videodownloader.site";
                if (referer) {
                    try {
                        origin = new URL(referer).origin;
                    } catch {
                        // Prepend https:// and try again if it was a bare domain name
                        try {
                            origin = new URL(referer.includes("://") ? referer : `https://${referer}`).origin;
                        } catch {
                            // Fallback to default origin
                        }
                    }
                }

                const headers = new Headers();
                headers.set("Referer", referer || "https://videodownloader.site/");
                headers.set("Origin", origin);
                headers.set(
                    "User-Agent",
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                );
                headers.set("Accept", "video/mp4,video/*;q=0.9,*/*;q=0.8");
                headers.set("Accept-Encoding", "identity");
                if (range) {
                    headers.set("Range", range);
                }

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15_000);

                // Construct an explicit Request object with the target URL, headers, and signal.
                // This ensures Cloudflare Workers preserves the Referer header on the
                // outbound fetch (plain headers object can get stripped by the runtime).
                const upstreamReq = new Request(targetUrl, {
                    method: "GET",
                    headers,
                    redirect: "follow",
                    signal: controller.signal,
                });

                const upstream = await fetch(upstreamReq);

                clearTimeout(timeoutId);
                lastStatus = upstream.status;

                if ([403, 404, 410].includes(upstream.status)) {
                    continue;
                }
                if (upstream.status >= 500) {
                    continue;
                }

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
                    "Cache-Control",
                    "no-store, no-cache, must-revalidate, max-age=0",
                );
                resHeaders.set("CDN-Cache-Control", "no-store");
                resHeaders.set("Cloudflare-CDN-Cache-Control", "no-store");

                return new Response(upstream.body, {
                    status: upstream.status,
                    headers: resHeaders,
                });
            } catch (err: unknown) {
                lastError =
                    err instanceof Error ? err.message : "Unknown fetch error";
                continue;
            }
        }


        // All referers failed
        if (lastStatus === 403 || lastStatus === 404 || lastStatus === 410) {
            return new Response(
                JSON.stringify({
                    error: "cdn_rejected",
                    cdnStatus: lastStatus,
                    tried: referersToTry.length,
                    message:
                        "CDN rejected all referer attempts. The stream token may have expired.",
                }),
                {
                    status: 422,
                    headers: {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*",
                    },
                },
            );
        }

        if (
            lastError.includes("timeout") ||
            lastError.includes("abort") ||
            lastError.includes("Abort")
        ) {
            return new Response(
                JSON.stringify({
                    error: "timeout",
                    message: "All referers timed out",
                }),
                {
                    status: 504,
                    headers: {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*",
                    },
                },
            );
        }

        return new Response(
            JSON.stringify({
                error: "proxy_error",
                message: lastError || "Stream unavailable from all mirrors",
                cdnStatus: lastStatus || 502,
            }),
            {
                status: 502,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
            },
        );
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Internal proxy error";
        return new Response(
            JSON.stringify({ error: "internal_error", message: msg }),
            {
                status: 500,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
            },
        );
    }
}
