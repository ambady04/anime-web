import { NextRequest } from "next/server";

// Node.js runtime so maxDuration:60 in vercel.json applies.
export const runtime = "nodejs";
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

    let lastStatus = 0;
    let lastError: Error | null = null;

    // Try each referer until one works
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

        // 30-second abort per referer attempt
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30_000);

        try {
            const upstream = await fetch(targetUrl, {
                headers: upstreamHeaders,
                signal: controller.signal,
                // @ts-expect-error duplex is valid in Node 18+ fetch
                duplex: "half",
            });

            clearTimeout(timeout);
            lastStatus = upstream.status;

            // CDN rejected with this referer — try the next one
            if ([403, 404, 410].includes(upstream.status)) {
                continue;
            }

            // 5xx — CDN is having issues, try next referer
            if (upstream.status >= 500) {
                continue;
            }

            // Success! Stream the response through
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

            resHeaders.set("Access-Control-Allow-Origin", "*");
            resHeaders.set("Cache-Control", "public, max-age=3600");
            resHeaders.set("X-Accel-Buffering", "no");

            return new Response(upstream.body as ReadableStream, {
                status: upstream.status,
                headers: resHeaders,
            });
        } catch (err: any) {
            clearTimeout(timeout);
            lastError = err;
            // Timeout or network error — try next referer
            continue;
        }
    }

    // All referers failed
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

    if (lastError?.name === "AbortError") {
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
