import { NextRequest, NextResponse } from "next/server";

// The upstream video CDN blocks Cloudflare Worker IPs (returns 502/403).
// Video proxying MUST run on Vercel (AWS IPs) at api.abisolutions.online.
//
// This route only exists as a safety net: if any client accidentally hits
// /api/video on the CF Worker, redirect them to the Vercel-hosted proxy.

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
    // Preserve all query params and redirect to Vercel
    const { searchParams } = req.nextUrl;
    const qs = searchParams.toString();
    const redirectUrl = `${VERCEL_VIDEO_PROXY}${qs ? `?${qs}` : ""}`;

    return NextResponse.redirect(redirectUrl, {
        status: 302,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store",
        },
    });
}
