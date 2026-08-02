import { NextRequest, NextResponse } from "next/server";
import { movieService } from "@/lib/server/movie-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const name = searchParams.get("name") || "";
        const page = parseInt(searchParams.get("page") || "1", 10);
        const query = searchParams.get("query") || undefined;
        const adult = searchParams.get("adult") === "true";

        if (!name) {
            return NextResponse.json(
                { error: "invalid_category", detail: "Category name required" },
                { status: 400 },
            );
        }

        const data = await movieService.getCategory(name, page, query, adult);

        return NextResponse.json(data, {
            headers: {
                "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
                "CDN-Cache-Control": "public, max-age=1800, stale-while-revalidate=3600",
                "Cloudflare-CDN-Cache-Control": "public, max-age=1800, stale-while-revalidate=3600",
            },
        });
    } catch (err: any) {
        return NextResponse.json(
            { error: "failed_to_fetch_category", message: err?.message || String(err) },
            { status: 500 },
        );
    }
}
