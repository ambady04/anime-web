import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Lightweight proxy to:
 * 1. Add cache headers for static/ISR pages at the edge
 * 2. Prevent unnecessary origin hits for cacheable content
 * 
 * IMPORTANT: This runs at the edge — no database access, no heavy logic.
 */
export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const response = NextResponse.next();

    // Add security headers (minimal overhead, good practice)
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

    // Homepage and static client pages — ISR cached, add stale-while-revalidate
    if (pathname === "/") {
        response.headers.set(
            "Cache-Control",
            "public, s-maxage=3600, stale-while-revalidate=7200"
        );
    }

    // Search page is client-rendered, so the shell can be cached
    if (pathname === "/search") {
        response.headers.set(
            "Cache-Control",
            "public, s-maxage=86400, stale-while-revalidate=86400"
        );
    }

    // Favorites and History are pure client pages (localStorage), shell is static
    if (pathname === "/favorites" || pathname === "/history") {
        response.headers.set(
            "Cache-Control",
            "public, s-maxage=86400, stale-while-revalidate=86400"
        );
    }

    return response;
}

// Only run proxy on page routes, not on API routes or static files
export const config = {
    matcher: [
        "/",
        "/search",
        "/favorites",
        "/history",
        "/watch/:path*",
    ],
};
