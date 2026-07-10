import { NextRequest } from "next/server";

// Edge runtime for low-latency responses
export const runtime = "edge";
export const dynamic = "force-dynamic";

// Multiple referers to try — CDNs may accept different ones
const REFERER_POOL = [
    "https://videodownloader.site/",
    "https://h5.aoneroom.com/",
    "https://moviebox.ph/",
    "https://www.movieboxpro.app/",
];

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const targetUrl = searchParams.get("url");
    const mode = searchParams.get("mode"); // "probe" = find working URL, "stream" = proxy bytes

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

    // === PROBE MODE (default) ===
    // Instead of streaming gigabytes through Vercel, we:
    // 1. Send a HEAD/Range request to find a working referer
    // 2. Return the working referer + CDN URL to the client
    // 3. Client uses this info to fetch directly from CDN via <video> tag
    //
    // This reduces Origin Transfer from ~16GB to nearly zero for video data.
    if (mode !== "stream") {
        for (const referer of referersToTry) {
            const upstreamHeaders: Record<string, string> = {
                Referer: referer,
                Origin: new URL(referer).origin,
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                Accept: "*/*",
                "Accept-Encoding": "identity",
                Range: "bytes=0-1", // Minimal probe request
            };

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8_000);

            try {
                const upstream = await fetch(targetUrl, {
                    headers: upstreamHeaders,
                    signal: controller.signal,
                });

                clearTimeout(timeout);

                if ([403, 404, 410].includes(upstream.status)) {
                    continue;
                }
                if (upstream.status >= 500) {
                    continue;
                }

                // Success! Return the working referer info to client
                const contentLength = upstream.headers.get("content-length");
                const contentType = upstream.headers.get("content-type");
                const acceptRanges = upstream.headers.get("accept-ranges");

                return new Response(
                    JSON.stringify({
                        url: targetUrl,
                        referer: referer,
                        origin: new URL(referer).origin,
                        contentType: contentType || "video/mp4",
                        contentLength: contentLength,
                        acceptRanges: acceptRanges || "bytes",
                        mode: "direct", // Tell client to fetch directly
                    }),
                    {
                        status: 200,
                        headers: {
                            "Content-Type": "application/json",
                            "Access-Control-Allow-Origin": "*",
                            "Cache-Control":
                                "public, max-age=1800, s-maxage=1800",
                        },
                    },
                );
            } catch {
                clearTimeout(timeout);
                continue;
            }
        }

        // All probes failed — fall back to stream mode
        // (Client will retry with mode=stream)
        return new Response(
            JSON.stringify({
                mode: "stream",
                message: "Direct access unavailable, use stream mode",
            }),
            {
                status: 200,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "no-store",
                },
            },
        );
    }

    // === STREAM MODE (fallback) ===
    // Only used when CDN requires referer validation that browsers can't provide.
    // This is the old behavior — proxy bytes through Vercel origin.
    let lastStatus = 0;
    let lastError: Error | null = null;

    for (const referer of referersToTry) {
        const upstreamHeaders: Record<string, string> = {
            Referer: referer,
            Origin: new URL(referer).origin,
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            Accept: "*/*",
            "Accept-Encoding": "identity",
        };

        if (range) {
            upstreamHeaders["Range"] = range;
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30_000);

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

            if (!resHeaders.has("accept-ranges")) {
                resHeaders.set("accept-ranges", "bytes");
            }

            const download = searchParams.get("download");
            const filename = searchParams.get("filename");
            if (download === "true" || filename) {
                const safeFilename = (filename || "video.mp4")
                    .replace(/["\\]/g, "")
                    .replace(/[^\x20-\x7E]/g, "_");
                resHeaders.set(
                    "Content-Disposition",
                    `attachment; filename="${safeFilename}"`
                );
            }

            resHeaders.set("Access-Control-Allow-Origin", "*");
            // Aggressive caching for streamed video segments
            resHeaders.set(
                "Cache-Control",
                "public, max-age=7200, s-maxage=7200",
            );
            resHeaders.set("X-Accel-Buffering", "no");

            return new Response(upstream.body as ReadableStream, {
                status: upstream.status,
                headers: resHeaders,
            });
        } catch (err: unknown) {
            clearTimeout(timeout);
            lastError = err as Error;
            continue;
        }
    }

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
