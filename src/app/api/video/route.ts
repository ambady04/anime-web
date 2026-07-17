import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
// Extend Vercel serverless function timeout to the max allowed (60s on Pro, 10s on Hobby)
// This gives enough time for the CDN to respond with the first byte before we start streaming.
export const maxDuration = 60;

// Multiple referers to try — CDNs may accept different ones
const REFERER_POOL = [
    "https://videodownloader.site/",
    "https://h5.aoneroom.com/",
    "https://moviebox.ph/",
    "https://www.movieboxpro.app/",
    "https://fmoviesunblocked.net/",
];

export async function GET(req: NextRequest) {
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
        ? [clientReferer, ...REFERER_POOL.filter((r) => r !== clientReferer)]
        : REFERER_POOL;

    // === STREAM MODE ===
    // All video is proxied through Vercel so the CDN Referer requirement is
    // satisfied without exposing raw CDN URLs or tokens to the browser.
    let lastStatus = 0;
    let lastError: Error | null = null;

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

        const controller = new AbortController();
        // 25s timeout — leaves headroom below Vercel's 30s default / 60s Pro limit
        const timeout = setTimeout(() => controller.abort(), 25_000);

        try {
            const upstream = await fetch(targetUrl, {
                headers: upstreamHeaders,
                signal: controller.signal,
            });

            clearTimeout(timeout);
            lastStatus = upstream.status;

            if ([403, 404, 410].includes(upstream.status)) {
                continue;
            }
            if (upstream.status >= 500) {
                continue;
            }

            const resHeaders = new Headers();

            // Forward relevant CDN headers to the browser
            for (const h of [
                "content-type",
                "content-length",
                "content-range",
                "accept-ranges",
                "etag",
                "last-modified",
            ]) {
                const v = upstream.headers.get(h);
                if (v) resHeaders.set(h, v);
            }

            // Ensure browser knows range requests are supported (required for seeking)
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
            // Disable CDN and browser caching. Range requests must never be cached
            // because they share the same URL but request different byte ranges.
            resHeaders.set(
                "Cache-Control",
                "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
            );
            resHeaders.set("CDN-Cache-Control", "no-store");
            resHeaders.set("Cloudflare-CDN-Cache-Control", "no-store");
            // Prevent Nginx/proxy buffering so bytes flow directly to the browser
            resHeaders.set("X-Accel-Buffering", "no");

            // Pipe the upstream body through a fresh ReadableStream to avoid
            // the Node.js 25 / Next.js 16 TransformStream internal bug:
            // "controller[kState].transformAlgorithm is not a function"
            // This happens when passing fetch's ReadableStream directly as a Response body.
            const body = upstream.body;
            let responseBody: ReadableStream<Uint8Array> | null = null;

            if (body) {
                const reader = body.getReader();
                responseBody = new ReadableStream<Uint8Array>({
                    async pull(ctrl) {
                        try {
                            const { done, value } = await reader.read();
                            if (done) {
                                ctrl.close();
                            } else {
                                ctrl.enqueue(value);
                            }
                        } catch (err) {
                            ctrl.error(err);
                        }
                    },
                    cancel() {
                        reader.cancel().catch(() => {});
                    },
                });
            }

            return new Response(responseBody, {
                status: upstream.status,
                headers: resHeaders,
            });
        } catch (err: unknown) {
            clearTimeout(timeout);
            lastError = err as Error;
            continue;
        }
    }

    // All referers failed — return a descriptive error
    if (lastStatus === 403 || lastStatus === 404 || lastStatus === 410) {
        return new Response(
            JSON.stringify({ error: "cdn_rejected", cdnStatus: lastStatus }),
            {
                status: 422,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
            },
        );
    }

    if (lastError && "name" in lastError && lastError.name === "AbortError") {
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
            message: "Stream unavailable from all mirrors",
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
}
