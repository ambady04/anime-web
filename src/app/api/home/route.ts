import { NextRequest, NextResponse } from "next/server";
import { movieService } from "@/lib/server/movie-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const adult = searchParams.get("adult") === "true";

        const data = await movieService.getHome(adult);

        return NextResponse.json(data, {
            headers: {
                "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
                "CDN-Cache-Control": "public, max-age=3600, stale-while-revalidate=7200",
                "Cloudflare-CDN-Cache-Control": "public, max-age=3600, stale-while-revalidate=7200",
            },
        });
    } catch (err: any) {
        return NextResponse.json(
            { error: "failed_to_fetch_home", message: err?.message || String(err) },
            { status: 500 },
        );
    }
}
