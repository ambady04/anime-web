import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
    return new NextResponse(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "Range, Content-Type",
            "Access-Control-Expose-Headers":
                "Content-Range, Content-Length, Accept-Ranges, Content-Type",
            "Access-Control-Max-Age": "86400",
        },
    });
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = req.nextUrl;
        let url = searchParams.get("url");

        if (!url) {
            const rawQs = req.nextUrl.search;
            if (rawQs.includes("url=")) {
                let part = rawQs.split("url=")[1];
                for (const delim of ["&referer=", "&mode="]) {
                    if (part.includes(delim)) {
                        part = part.split(delim)[0];
                    }
                }
                url = decodeURIComponent(part);
            }
        }

        if (!url) {
            return NextResponse.json(
                { detail: "Missing url parameter" },
                { status: 400, headers: { "Access-Control-Allow-Origin": "*" } },
            );
        }

        const rangeHeader = req.headers.get("range");
        const reqHeaders: Record<string, string> = {
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            Accept: "*/*",
            "Accept-Encoding": "identity",
            Referer: "https://videodownloader.site/",
            Origin: "https://videodownloader.site/",
        };

        if (rangeHeader) {
            reqHeaders["Range"] = rangeHeader;
        }

        const upstreamResp = await fetch(url, {
            headers: reqHeaders,
            cache: "no-store",
        });

        if (!upstreamResp.ok && upstreamResp.status !== 206) {
            return NextResponse.json(
                { error: "cdn_rejected", status: upstreamResp.status },
                { status: 502, headers: { "Access-Control-Allow-Origin": "*" } },
            );
        }

        const resHeaders = new Headers();
        for (const h of [
            "content-type",
            "content-range",
            "content-length",
            "accept-ranges",
            "etag",
            "last-modified",
        ]) {
            const v = upstreamResp.headers.get(h);
            if (v) resHeaders.set(h, v);
        }

        if (!resHeaders.has("accept-ranges")) resHeaders.set("accept-ranges", "bytes");
        if (!resHeaders.has("content-type")) resHeaders.set("content-type", "video/mp4");
        resHeaders.set("Access-Control-Allow-Origin", "*");
        resHeaders.set(
            "Access-Control-Expose-Headers",
            "Content-Range, Content-Length, Accept-Ranges, Content-Type",
        );
        resHeaders.set("Cache-Control", "public, max-age=3600, s-maxage=3600");

        return new NextResponse(upstreamResp.body, {
            status: upstreamResp.status,
            headers: resHeaders,
        });
    } catch (err: any) {
        return new NextResponse(null, {
            status: 200,
            headers: { "Access-Control-Allow-Origin": "*" },
        });
    }
}
