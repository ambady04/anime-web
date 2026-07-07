import { NextRequest } from "next/server";

// Node.js runtime so maxDuration:60 in vercel.json applies.
// Edge runtime has a hard 25s wall-time limit which kills slow CDN connections on mobile.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 800;

async function fetchWithRetry(
    targetUrl: string,
    upstreamHeaders: Record<string, string>,
    retries = MAX_RETRIES,
): Promise<Response> {
    let lastError: Error | null = null;
    let lastResponse: Response | null = null;

    for (let attempt = 0; attempt < retries; attempt++) {
        // 45-second abort per attempt — leaves room for retries within Vercel's 60s limit
        const controller = new AbortController();
        const perAttemptTimeout = Math.max(45_000 - attempt * 10_000, 20_000);
        const timeout = setTimeout(() => controller.abort(), perAttemptTimeout);

        try {
            const upstream = await fetch(targetUrl, {
                headers: upstreamHeaders,
                signal: controller.signal,
                // @ts-expect-error duplex is valid in Node 18 fetch
                duplex: "half",
            });

            clearTimeout(timeout);

            // CDN hard-rejected — no point retrying (403, 404, 410)
            if ([403, 404, 410].includes(upstream.status)) {
                return upstream;
            }

            // Transient server errors — retry with backoff
            if (upstream.status >= 500 && attempt < retries - 1) {
                lastResponse = upstream;
                const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
                await new Promise((r) => setTimeout(r, backoff));
                continue;
            }

            // Success or non-retryable client error
            return upstream;
        } catch (err: any) {
            clearTimeout(timeout);
            lastError = err;

            // AbortError (timeout) or network error — retry with backoff
            if (attempt < retries - 1) {
                const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
                await new Promise((r) => setTimeout(r, backoff));
                continue;
            }
        }
    }

    // All retries exhausted — throw the last error or return last response
    if (lastError) throw lastError;
    return lastResponse!;
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const targetUrl = searchParams.get("url");

    if (!targetUrl) {
        return new Response("Missing url parameter", { status: 400 });
    }

    const range = req.headers.get("range");

    const upstreamHeaders: Record<string, string> = {
        Referer: "https://videodownloader.site/",
        Origin: "https://videodownloader.site",
        "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "*/*",
        "Accept-Encoding": "identity", // prevent gzip so Content-Length is accurate
    };

    if (range) {
        upstreamHeaders["Range"] = range;
    }

    try {
        const upstream = await fetchWithRetry(targetUrl, upstreamHeaders);

        // CDN hard-rejected the URL — tell the client to fall back to the next quality
        if ([403, 404, 410].includes(upstream.status)) {
            return new Response(
                JSON.stringify({
                    error: "cdn_rejected",
                    cdnStatus: upstream.status,
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

        // Server still erroring after retries
        if (upstream.status >= 500) {
            return new Response(
                JSON.stringify({
                    error: "cdn_unavailable",
                    cdnStatus: upstream.status,
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

        // Always advertise range support — required by iOS Safari before it will stream
        if (!resHeaders.has("accept-ranges")) {
            resHeaders.set("accept-ranges", "bytes");
        }

        resHeaders.set("Access-Control-Allow-Origin", "*");
        resHeaders.set("Cache-Control", "public, max-age=3600");
        resHeaders.set("X-Accel-Buffering", "no"); // stop Vercel/nginx from buffering

        // Pipe body straight through — no buffering, no arrayBuffer()
        return new Response(upstream.body as ReadableStream, {
            status: upstream.status,
            headers: resHeaders,
        });
    } catch (err: any) {
        if (err?.name === "AbortError") {
            return new Response(
                JSON.stringify({
                    error: "timeout",
                    message: "Upstream CDN timed out after retries",
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
        console.error("Video proxy error:", err?.message ?? err);
        return new Response(
            JSON.stringify({
                error: "proxy_error",
                message: "Error loading stream",
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
}
