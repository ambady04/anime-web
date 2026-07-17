import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
// Note: Do NOT set runtime = "edge" here. OpenNext for Cloudflare already runs
// all routes as Workers. Explicitly setting edge causes bundling conflicts.

// Multiple referers to try — CDNs may accept different ones
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

        // Optional referer override from the client
        const clientReferer = searchParams.get("referer");
        const range = req.headers.get("range");

        // Build referer list — client-provided one goes first, then the pool
        const referersToTry = clientReferer
            ? [
                  clientReferer,
                  ...REFERER_POOL.filter((r) => r !== clientReferer),
              ]
            : REFERER_POOL;

        let lastStatus = 0;
        let lastError = "";

        for (const referer of referersToTry) {
            const upstreamHeaders: Record<string, string> = {
                Referer: referer,
                Origin: new URL(referer).origin,
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                Accept: "video/mp4,video/*;q=0.9,*/*;q=0.8",
                "Accept-Encoding": "identity",
            };

            if (range) {
                upstreamHeaders["Range"] = range;
            }

            try {
                // Use AbortController for timeout (universally supported in Workers + Node)
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15_000);

                const upstream = await fetch(targetUrl, {
                    headers: upstreamHeaders,
                    signal: controller.signal,
                });

                clearTimeout(timeoutId);
                lastStatus = upstream.status;

                if ([403, 404, 410].includes(upstream.status)) {
                    continue;
                }
                if (upstream.status >= 500) {
                    continue;
                }

                const resHeaders = new Headers();

                // Forward relevant CDN headers to the browser
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

                // Ensure browser knows range requests are supported
                if (!resHeaders.has("accept-ranges")) {
                    resHeaders.set("accept-ranges", "bytes");
                }

                // Force correct MIME type for video if missing
                if (!resHeaders.has("content-type")) {
                    resHeaders.set("content-type", "video/mp4");
                }

                // Handle optional download mode
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

                // Pass the upstream body directly as a streaming response.
                // Both Cloudflare Workers and Node.js support ReadableStream passthrough.
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
        // Top-level catch — if anything unexpected crashes, return JSON error
        // instead of Cloudflare's generic 500 page
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
