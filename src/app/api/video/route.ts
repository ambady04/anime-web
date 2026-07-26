import { NextRequest, NextResponse } from "next/server";

// Video proxy: forwards requests to the Vercel-hosted backend which proxies
// the video from CDN with correct headers (Lavf UA, no Referer).
//
// Why not fetch CDN directly from this CF Worker?
// The CDN (bcdn.hakunaymatata.com) blocks ALL Cloudflare IP ranges (returns 427).
// Vercel uses AWS IPs which the CDN accepts.
//
// Flow: Browser → /api/video (CF Worker) → api.abisolutions.online/api/video (Vercel) → CDN
export const dynamic = "force-dynamic";

const VERCEL_VIDEO_PROXY =
    process.env.VIDEO_PROXY_URL ||
    process.env.NEXT_PUBLIC_VIDEO_PROXY_URL ||
    (process.env.NODE_ENV === "development"
        ? "http://localhost:8000/api/video"
        : "https://api.abisolutions.online/api/video");

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
        const referer = searchParams.get("referer") || "https://videodownloader.site/";
        const mode = searchParams.get("mode") || "stream";

        let upstreamUrl: string;
        if (targetUrl) {
            upstreamUrl = `${VERCEL_VIDEO_PROXY}?url=${encodeURIComponent(targetUrl)}&referer=${encodeURIComponent(referer)}&mode=${mode}`;
        } else {
            const qs = searchParams.toString();
            upstreamUrl = `${VERCEL_VIDEO_PROXY}${qs ? `?${qs}` : ""}`;
        }

        // Forward Range header for seek support
        const reqHeaders: Record<string, string> = {
            Accept: "*/*",
        };
        const range = req.headers.get("range");
        if (range) {
            reqHeaders["Range"] = range;
        }

        const upstream = await fetch(upstreamUrl, {
            headers: reqHeaders,
            redirect: "follow",
            signal: req.signal,
            // @ts-ignore — CF-specific: bypass edge cache to avoid stale cached errors
            cf: { cacheTtl: 0, cacheEverything: false },
        });

        // If upstream returned an error, pass it through with no-cache
        if (!upstream.ok && upstream.status !== 206) {
            const errorBody = await upstream.text();
            // Map 422 or 403 to 502 so browser HTML5 video element triggers immediate recovery
            const returnStatus =
                upstream.status === 422 || upstream.status === 403
                    ? 502
                    : upstream.status;
            return new NextResponse(errorBody, {
                status: returnStatus,
                headers: {
                    "Content-Type":
                        upstream.headers.get("content-type") ||
                        "application/json",
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "no-store, no-cache, must-revalidate",
                    "CDN-Cache-Control": "no-store",
                },
            });
        }

        // Stream video bytes through to the client
        const resHeaders = new Headers();
        const forwardHeaders = [
            "content-type",
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

        resHeaders.set("Access-Control-Allow-Origin", "*");
        resHeaders.set(
            "Access-Control-Expose-Headers",
            "Content-Range, Content-Length, Accept-Ranges, Content-Type",
        );
        resHeaders.set("Cache-Control", "public, max-age=3600, s-maxage=3600");
        resHeaders.set("X-Accel-Buffering", "no");

        // Attach abort signal listener to cleanly cancel upstream body on client disconnect
        if (req.signal && upstream.body) {
            req.signal.addEventListener(
                "abort",
                () => {
                    try {
                        if (upstream.body && !upstream.body.locked) {
                            upstream.body.cancel();
                        }
                    } catch {}
                },
                { once: true },
            );
        }

        return new NextResponse(upstream.body, {
            status: upstream.status,
            headers: resHeaders,
        });
    } catch (err: unknown) {
        // Handle client aborts (e.g. user seeking or closing video tab) gracefully
        const isAbort =
            req.signal.aborted ||
            (err instanceof Error &&
                (err.name === "AbortError" ||
                    err.message.includes("terminated") ||
                    err.message.includes("closed") ||
                    err.message.includes("UND_ERR_SOCKET")));

        if (isAbort) {
            return new NextResponse(null, { status: 499 });
        }

        const msg = err instanceof Error ? err.message : "Internal proxy error";
        return new NextResponse(
            JSON.stringify({ error: "internal_error", message: msg }),
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
