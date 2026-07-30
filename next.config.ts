import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    // Image optimization is disabled — Cloudflare Workers doesn't support
    // Next.js built-in image optimization. Images are served directly from CF Assets.
    images: {
        formats: ["image/avif", "image/webp"],
        minimumCacheTTL: 86400,
        unoptimized: true,
    },

    // Headers are baked into the Cloudflare Worker at build time by OpenNext.
    // This is the correct way to set security + cache headers — no middleware needed.
    async headers() {
        const securityHeaders = [
            { key: "X-Content-Type-Options", value: "nosniff" },
            { key: "X-Frame-Options", value: "SAMEORIGIN" },
            {
                key: "Referrer-Policy",
                value: "strict-origin-when-cross-origin",
            },
            {
                key: "Permissions-Policy",
                value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
            },
            { key: "X-DNS-Prefetch-Control", value: "on" },
        ];

        return [
            // Apply security headers to all routes
            {
                source: "/(.*)",
                headers: securityHeaders,
            },
            // Homepage — ISR, cache 1h at CF edge
            {
                source: "/",
                headers: [
                    {
                        key: "Cache-Control",
                        value: "public, s-maxage=3600, stale-while-revalidate=7200",
                    },
                    {
                        key: "CDN-Cache-Control",
                        value: "public, max-age=3600, stale-while-revalidate=7200",
                    },
                    {
                        key: "Cloudflare-CDN-Cache-Control",
                        value: "public, max-age=3600, stale-while-revalidate=7200",
                    },
                ],
            },
            // Search / Favorites / History — static shells, cache 24h
            {
                source: "/(search|favorites|history)",
                headers: [
                    {
                        key: "Cache-Control",
                        value: "public, s-maxage=86400, stale-while-revalidate=86400",
                    },
                    {
                        key: "CDN-Cache-Control",
                        value: "public, max-age=86400, stale-while-revalidate=86400",
                    },
                    {
                        key: "Cloudflare-CDN-Cache-Control",
                        value: "public, max-age=86400, stale-while-revalidate=86400",
                    },
                ],
            },
            // Watch pages — dynamic (stream URLs expire), never cache at edge
            {
                source: "/watch/:path*",
                headers: [
                    { key: "Cache-Control", value: "private, no-store" },
                    { key: "CDN-Cache-Control", value: "no-store" },
                    { key: "Cloudflare-CDN-Cache-Control", value: "no-store" },
                ],
            },
            // API: home + details — cache 1h
            {
                source: "/api/(home|details)",
                headers: [
                    {
                        key: "Cache-Control",
                        value: "public, s-maxage=3600, stale-while-revalidate=7200",
                    },
                    {
                        key: "CDN-Cache-Control",
                        value: "public, max-age=3600, stale-while-revalidate=7200",
                    },
                    {
                        key: "Cloudflare-CDN-Cache-Control",
                        value: "public, max-age=3600, stale-while-revalidate=7200",
                    },
                ],
            },
            // API: search + category — cache 30min
            {
                source: "/api/(search|category)",
                headers: [
                    {
                        key: "Cache-Control",
                        value: "public, s-maxage=1800, stale-while-revalidate=3600",
                    },
                    {
                        key: "CDN-Cache-Control",
                        value: "public, max-age=1800, stale-while-revalidate=3600",
                    },
                    {
                        key: "Cloudflare-CDN-Cache-Control",
                        value: "public, max-age=1800, stale-while-revalidate=3600",
                    },
                ],
            },
            // API: stream + video proxy — never cache (expiring CDN tokens, Range byte-serving)
            {
                source: "/api/(stream|video)",
                headers: [
                    {
                        key: "Cache-Control",
                        value: "private, no-store, max-age=0",
                    },
                    { key: "CDN-Cache-Control", value: "no-store" },
                    { key: "Cloudflare-CDN-Cache-Control", value: "no-store" },
                ],
            },
        ];
    },
};

export default nextConfig;
