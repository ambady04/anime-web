import { NextRequest, NextResponse } from "next/server";
import { streamService } from "@/lib/server/stream-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const path = searchParams.get("path") || "";
        const season = parseInt(searchParams.get("season") || "0", 10);
        const episode = parseInt(searchParams.get("episode") || "0", 10);
        const adult = searchParams.get("adult") === "true";

        if (!path) {
            return NextResponse.json(
                { error: "invalid_path", detail: "Empty or invalid path" },
                { status: 404 },
            );
        }

        const data = await streamService.getStream(path, season, episode, adult);

        return NextResponse.json(data, {
            headers: {
                "Cache-Control": "private, no-store, max-age=0",
                "CDN-Cache-Control": "no-store",
                "Cloudflare-CDN-Cache-Control": "no-store",
            },
        });
    } catch (err: any) {
        return NextResponse.json(
            { error: "failed_to_fetch_stream", message: err?.message || String(err) },
            { status: 500 },
        );
    }
}
