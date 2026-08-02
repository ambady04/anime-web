import { NextRequest, NextResponse } from "next/server";
import { movieService } from "@/lib/server/movie-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const q = searchParams.get("q") || "";
        const page = parseInt(searchParams.get("page") || "1", 10);
        const typeStr = searchParams.get("type");
        const type = typeStr ? parseInt(typeStr, 10) : undefined;
        const adult = searchParams.get("adult") === "true";

        if (!q) {
            return NextResponse.json({ items: [] });
        }

        const data = await movieService.search(q, page, type, adult);

        return NextResponse.json(data, {
            headers: {
                "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
                "CDN-Cache-Control": "public, max-age=1800, stale-while-revalidate=3600",
                "Cloudflare-CDN-Cache-Control": "public, max-age=1800, stale-while-revalidate=3600",
            },
        });
    } catch (err: any) {
        return NextResponse.json(
            { error: "failed_to_search", message: err?.message || String(err) },
            { status: 500 },
        );
    }
}
