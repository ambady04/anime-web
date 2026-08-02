import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const REFERER_POOL = [
    "https://videodownloader.site/",
    "https://h5.aoneroom.com/",
    "https://moviebox.ph/",
    "https://www.movieboxpro.app/",
    "https://fmoviesunblocked.net/",
];

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
        const reqReferer = searchParams.get("referer") || "https://videodownloader.site/";

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

        // If an explicit external proxy URL is specified, forward to it
        if (process.env.VIDEO_PROXY_URL) {
            const upstreamUrl = `${process.env.VIDEO_PROXY_URL}?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(reqReferer)}`;
            const reqHeaders: Record<string, string> = { Accept: "*/*" };
            const range = req.headers.get("range");
            if (range) reqHeaders["Range"] = range;

            const upstream = await fetch(upstreamUrl, {
                headers: reqHeaders,
                signal: req.signal,
            });

            const resHeaders = new Headers();
            for (const h of ["content-type", "content-range", "content-length", "accept-ranges", "etag", "last-modified"]) {
                const v = upstream.headers.get(h);
                if (v) resHeaders.set(h, v);
            }
            resHeaders.set("Access-Control-Allow-Origin", "*");
            return new NextResponse(upstream.body, { status: upstream.status, headers: resHeaders });
        }

        // Direct CDN Byte Proxying (Lavf UA + Referer Pool)
        const referersToTry = [undefined, reqReferer, ...REFERER_POOL];
        const rangeHeader = req.headers.get("range");

        let lastStatus = 0;
        let upstreamResp: Response | null = null;

        for (const ref of referersToTry) {
            const headers: Record<string, string> = {
                "User-Agent": "Lavf/58.29.100",
                Accept: "*/*",
                "Accept-Encoding": "identity",
            };
            if (ref) headers["Referer"] = ref;
            if (rangeHeader) headers["Range"] = rangeHeader;

            try {
                const resp = await fetch(url, {
                    headers,
                    signal: req.signal,
                    cache: "no-store",
                });

                lastStatus = resp.status;
                if (resp.ok || resp.status === 206) {
                    upstreamResp = resp;
                    break;
                }
            } catch {
                continue;
            }
        }

        if (!upstreamResp) {
            return NextResponse.json(
                { error: "cdn_rejected", cdnStatus: lastStatus || 502 },
                { status: 502, headers: { "Access-Control-Allow-Origin": "*" } },
            );
        }

        const resHeaders = new Headers();
        for (const h of ["content-type", "content-range", "content-length", "accept-ranges", "etag", "last-modified"]) {
            const v = upstreamResp.headers.get(h);
            if (v) resHeaders.set(h, v);
        }

        if (!resHeaders.has("accept-ranges")) resHeaders.set("accept-ranges", "bytes");
        if (!resHeaders.has("content-type")) resHeaders.set("content-type", "video/mp4");
        resHeaders.set("Access-Control-Allow-Origin", "*");
        resHeaders.set("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges, Content-Type");
        resHeaders.set("Cache-Control", "public, max-age=3600, s-maxage=3600");

        return new NextResponse(upstreamResp.body, {
            status: upstreamResp.status,
            headers: resHeaders,
        });
    } catch (err: any) {
        const isAbort =
            req.signal.aborted ||
            (err instanceof Error && (err.name === "AbortError" || err.message.includes("closed")));

        if (isAbort) return new NextResponse(null, { status: 499 });

        return NextResponse.json(
            { error: "internal_error", message: err?.message || String(err) },
            { status: 502, headers: { "Access-Control-Allow-Origin": "*" } },
        );
    }
}
