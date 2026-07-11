import type { NextConfig } from "next";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.abisolutions.online";

const nextConfig: NextConfig = {
    // Optimize images
    images: {
        formats: ["image/avif", "image/webp"],
        minimumCacheTTL: 86400,
        unoptimized: true,
    },

    async rewrites() {
        return [
            // Forward specific anime API routes to the external API
            // NOTE: /api/video is intentionally excluded — it's our local streaming proxy
            {
                source: "/api/home",
                destination: `${API_BASE_URL}/api/home`,
            },
            {
                source: "/api/details",
                destination: `${API_BASE_URL}/api/details`,
            },
            {
                source: "/api/stream",
                destination: `${API_BASE_URL}/api/stream`,
            },
            {
                source: "/api/search",
                destination: `${API_BASE_URL}/api/search`,
            },
            {
                source: "/api/category",
                destination: `${API_BASE_URL}/api/category`,
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
