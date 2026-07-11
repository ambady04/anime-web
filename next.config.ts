import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    // Optimize images
    images: {
        formats: ["image/avif", "image/webp"],
        minimumCacheTTL: 86400,
    },

    async rewrites() {
        return [
            // Forward specific anime API routes to the external API
            // NOTE: /api/video is intentionally excluded — it's our local streaming proxy
            {
                source: "/api/home",
                destination: "https://api.abisolutions.online/api/home",
            },
            {
                source: "/api/details",
                destination:
                    "https://api.abisolutions.online/api/details",
            },
            {
                source: "/api/stream",
                destination:
                    "https://api.abisolutions.online/api/stream",
            },
            {
                source: "/api/search",
                destination:
                    "https://api.abisolutions.online/api/search",
            },
            {
                source: "/api/category",
                destination:
                    "https://api.abisolutions.online/api/category",
            },
        ];
    },

    async headers() {
        return [
            {
                // Cache homepage API responses at Vercel's edge
                source: "/api/home",
                headers: [
                    {
                        key: "Cache-Control",
                        value: "public, s-maxage=3600, stale-while-revalidate=7200",
                    },
                ],
            },
            {
                source: "/api/details",
                headers: [
                    {
                        key: "Cache-Control",
                        value: "public, s-maxage=3600, stale-while-revalidate=7200",
                    },
                ],
            },
            {
                source: "/api/search",
                headers: [
                    {
                        key: "Cache-Control",
                        value: "public, s-maxage=1800, stale-while-revalidate=3600",
                    },
                ],
            },
            {
                source: "/api/category",
                headers: [
                    {
                        key: "Cache-Control",
                        value: "public, s-maxage=1800, stale-while-revalidate=3600",
                    },
                ],
            },
        ];
    },
};

export default nextConfig;
