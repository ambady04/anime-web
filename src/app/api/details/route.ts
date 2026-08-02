import { NextRequest, NextResponse } from "next/server";
import { movieService } from "@/lib/server/movie-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const path = searchParams.get("path") || "";
        const adult = searchParams.get("adult") === "true";

        if (!path) {
            return NextResponse.json(
                { error: "invalid_path", detail: "Empty or invalid path" },
                { status: 404 },
            );
        }

        const data = await movieService.getDetails(path, adult);

        return NextResponse.json(data, {
            headers: {
                "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
                "CDN-Cache-Control": "public, max-age=3600, stale-while-revalidate=7200",
                "Cloudflare-CDN-Cache-Control": "public, max-age=3600, stale-while-revalidate=7200",
            },
        });
    } catch (err: any) {
        return NextResponse.json(
            { error: "failed_to_fetch_details", message: err?.message || String(err) },
            { status: 500 },
        );
    }
}
