import { NextRequest, NextResponse } from "next/server";

// Catch-all API proxy: forwards /api/* browser requests to the real API server.
// This is needed because the browser cannot call api.abisolutions.online directly
// (CORS). The server-side fetchFromApi already has the base URL; this route
// handles the browser-side (isBrowser = true) calls that use relative URLs.

export const dynamic = "force-dynamic";

const UPSTREAM_BASE = "https://api.abisolutions.online";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string[] }> },
) {
    const { slug } = await params;
    const path = "/" + slug.join("/");

    // Re-attach original query string
    const { searchParams } = new URL(req.url);
    const qs = searchParams.toString();
    const upstreamUrl = `${UPSTREAM_BASE}${path}${qs ? `?${qs}` : ""}`;

    try {
        const upstream = await fetch(upstreamUrl, {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                Accept: "application/json",
            },
            // Stream URLs contain expiring CDN tokens — never cache them
            next: path.includes("stream") ? { revalidate: 0 } : { revalidate: 3600 },
        });

        if (!upstream.ok) {
            return NextResponse.json(
                { error: upstream.statusText },
                { status: upstream.status },
            );
        }

        const data = await upstream.json();
        return NextResponse.json(data, {
            headers: {
                "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=60",
            },
        });
    } catch (err: unknown) {
        console.error(`API proxy error for ${upstreamUrl}:`, err);
        return NextResponse.json(
            { error: "upstream_error", message: String(err) },
            { status: 502 },
        );
    }
}
