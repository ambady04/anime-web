import { NextRequest, NextResponse } from "next/server";

// The upstream video CDN blocks Cloudflare Worker IPs (returns 502/403).
// Video proxying MUST run on Vercel (AWS IPs) at api.abisolutions.online.
//
// This route acts as a same-origin reverse proxy: the browser hits /api/video
// on the CF Worker (same origin = no CORS issues), and we forward the request
// to the Vercel-hosted video proxy which has AWS IPs the CDN accepts.

export const dynamic = "force-dynamic";

const VERCEL_VIDEO_PROXY = "https://api.abisolutions.online/api/video";

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
        const qs = searchParams.toString();
        const upstreamUrl = `${VERCEL_VIDEO_PROXY}${qs ? `?${qs}` : ""}`;

        // Forward Range header for seek support
        const reqHeaders: Record<string, string> = {
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            Accept: "video/mp4,video/*;q=0.9,*/*;q=0.8",
        };
        const range = req.headers.get("range");
        if (range) {
            reqHeaders["Range"] = range;
        }

        const upstream = await fetch(upstreamUrl, {
            headers: reqHeaders,
            redirect: "follow",
        });

        // If Vercel returns 429 (CDN rate-limit), retry once after a brief pause
        if (upstream.status === 429) {
            await new Promise((r) => setTimeout(r, 1500));
            const retry = await fetch(upstreamUrl, {
                headers: reqHeaders,
                redirect: "follow",
            });
            if (retry.ok || retry.status === 206) {
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
                    const v = retry.headers.get(h);
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
                return new NextResponse(retry.body, {
                    status: retry.status,
                    headers: resHeaders,
                });
            }
            // Retry also failed — return 429 to client
            return new NextResponse(
                JSON.stringify({
                    error: "rate_limited",
                    message: "CDN rate limited. Please wait and try again.",
                }),
                {
                    status: 429,
                    headers: {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*",
                        "Retry-After": "3",
                    },
                },
            );
        }

        if (!upstream.ok && upstream.status !== 206) {
            // Pass through error status from Vercel
            const errorBody = await upstream.text();
            return new NextResponse(errorBody, {
                status: upstream.status,
                headers: {
                    "Content-Type":
                        upstream.headers.get("content-type") ||
                        "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
            });
        }

        // Stream the response body through
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

        resHeaders.set("Access-Control-Allow-Origin", "*");
        resHeaders.set(
            "Access-Control-Expose-Headers",
            "Content-Range, Content-Length, Accept-Ranges, Content-Type",
        );
        resHeaders.set("Cache-Control", "public, max-age=3600, s-maxage=3600");

        return new NextResponse(upstream.body, {
            status: upstream.status,
            headers: resHeaders,
        });
    } catch (err: unknown) {
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
