import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Edge middleware — runs on Cloudflare Workers at the network boundary.
 * Responsibilities:
 * 1. Set security headers on all responses
 * 2. Set CDN-Cache-Control / Cloudflare-CDN-Cache-Control so Cloudflare
 *    caches SSR pages at the edge (separate from browser Cache-Control)
 *
 * IMPORTANT: No DB access, no heavy logic — this runs on every request.
 * NOTE: File is named middleware.ts for @opennextjs/cloudflare compatibility.
 *       (proxy.ts is the Next.js 16 convention but OpenNext doesn't support it yet.)
 */
export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const response = NextResponse.next();

    // ── Security Headers ──────────────────────────────────────────────────────
    response.headers.set("X-Content-Type-Options", "nosniff");
    // SAMEORIGIN allows our own pages to embed the video proxy route
    response.headers.set("X-Frame-Options", "SAMEORIGIN");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    );
    response.headers.set("X-DNS-Prefetch-Control", "on");

    // ── Cache Policies ────────────────────────────────────────────────────────
    // CDN-Cache-Control is read by Cloudflare and stripped before reaching the browser.
    // This means we can cache aggressively at the CF edge while still letting browsers
    // revalidate more frequently (or not cache at all for dynamic pages).

    if (pathname === "/") {
        // Homepage: ISR page — cache at CF edge for 1h, stale-while-revalidate 2h
        response.headers.set(
            "Cache-Control",
            "public, s-maxage=3600, stale-while-revalidate=7200",
        );
        response.headers.set(
            "CDN-Cache-Control",
            "public, max-age=3600, stale-while-revalidate=7200",
        );
        response.headers.set(
            "Cloudflare-CDN-Cache-Control",
            "public, max-age=3600, stale-while-revalidate=7200",
        );
    } else if (pathname === "/search") {
        // Search shell is static — cache at CF edge for 24h
        response.headers.set(
            "Cache-Control",
            "public, s-maxage=86400, stale-while-revalidate=86400",
        );
        response.headers.set(
            "CDN-Cache-Control",
            "public, max-age=86400, stale-while-revalidate=86400",
        );
        response.headers.set(
            "Cloudflare-CDN-Cache-Control",
            "public, max-age=86400, stale-while-revalidate=86400",
        );
    } else if (pathname === "/favorites" || pathname === "/history") {
        // Pure client-side pages — CF can cache the HTML shell for 24h
        response.headers.set(
            "Cache-Control",
            "public, s-maxage=86400, stale-while-revalidate=86400",
        );
        response.headers.set(
            "CDN-Cache-Control",
            "public, max-age=86400, stale-while-revalidate=86400",
        );
        response.headers.set(
            "Cloudflare-CDN-Cache-Control",
            "public, max-age=86400, stale-while-revalidate=86400",
        );
    } else if (pathname.startsWith("/watch/")) {
        // Watch pages are dynamic (stream URLs change) — don't cache at edge
        response.headers.set("Cache-Control", "private, no-store");
        response.headers.set("CDN-Cache-Control", "no-store");
        response.headers.set("Cloudflare-CDN-Cache-Control", "no-store");
    }

    return response;
}

// Run on page routes only — not on API routes or Next.js internals
export const config = {
    matcher: [
        "/",
        "/search",
        "/favorites",
        "/history",
        "/watch/:path*",
    ],
};
