import { NextRequest, NextResponse } from "next/server";

// Catch-all API proxy: forwards /api/* browser requests to the real API server.
// This is needed because the browser cannot call api.abisolutions.online directly (CORS).
// Uses Cloudflare's native fetch cache (cf.cacheTtl + cf.cacheEverything) to cache
// JSON responses at the CF edge — no repeated upstream fetches for the same data.

export const dynamic = "force-dynamic";

const UPSTREAM_BASE = "https://api.abisolutions.online";

// Per-endpoint Cloudflare edge cache TTLs (seconds).
// Stream URLs have expiring CDN tokens — must never be cached.
const CF_CACHE_TTLS: Record<string, number> = {
    home:     3600,   // 1 hour
    details:  3600,   // 1 hour
    search:   1800,   // 30 minutes
    category: 1800,   // 30 minutes
    fillers:  86400,  // 24 hours (filler episode data changes rarely)
};

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ slug: string[] }> },
) {
    const { slug } = await params;
    const endpoint = slug[0]; // e.g. "home", "details", "stream"
    const path = "/api/" + slug.join("/");

    const { searchParams } = new URL(req.url);
    const qs = searchParams.toString();
    const upstreamUrl = `${UPSTREAM_BASE}${path}${qs ? `?${qs}` : ""}`;

    const cacheTtl = CF_CACHE_TTLS[endpoint];
    const shouldCache = cacheTtl !== undefined && endpoint !== "stream";

    try {
        const upstream = await fetch(upstreamUrl, {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                Accept: "application/json",
            },
            // Cloudflare-specific fetch options: cache the response at the CF edge.
            // cf.cacheEverything overrides the upstream's own Cache-Control header.
            // cf.cacheTtl sets how long CF caches the response (in seconds).
            ...(shouldCache && {
                // @ts-ignore — CF-specific fetch option, not in standard TS types
                cf: {
                    cacheEverything: true,
                    cacheTtl,
                    cacheKey: upstreamUrl,
                },
            }),
            // Also use Next.js ISR cache as a secondary layer
            next: shouldCache ? { revalidate: cacheTtl } : { revalidate: 0 },
        });

        if (!upstream.ok) {
            return NextResponse.json(
                { error: upstream.statusText },
                { status: upstream.status },
            );
        }

        const data = await upstream.json();

        // Response headers: tell CF edge to cache, but browsers can revalidate
        const responseHeaders: Record<string, string> = shouldCache
            ? {
                  "Cache-Control": `public, s-maxage=${cacheTtl}, stale-while-revalidate=${cacheTtl * 2}`,
                  "CDN-Cache-Control": `public, max-age=${cacheTtl}, stale-while-revalidate=${cacheTtl * 2}`,
                  "Cloudflare-CDN-Cache-Control": `public, max-age=${cacheTtl}, stale-while-revalidate=${cacheTtl * 2}`,
              }
            : {
                  "Cache-Control": "private, no-store, max-age=0",
                  "CDN-Cache-Control": "no-store",
                  "Cloudflare-CDN-Cache-Control": "no-store",
              };

        return NextResponse.json(data, { headers: responseHeaders });
    } catch (err: unknown) {
        return NextResponse.json(
            { error: "upstream_error", message: String(err) },
            { status: 502 },
        );
    }
}
