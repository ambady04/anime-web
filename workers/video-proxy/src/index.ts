/**
 * Cloudflare Worker — Video Stream Proxy
 *
 * Streams video from CDN to user with the correct Referer header.
 * Cloudflare Workers free tier: 100k req/day, UNLIMITED bandwidth.
 * This eliminates Vercel bandwidth costs entirely for video playback.
 *
 * Usage: GET /?url=<encoded_cdn_url>&referer=<encoded_referer>
 */

const REFERER_POOL = [
  "https://videodownloader.site/",
  "https://h5.aoneroom.com/",
  "https://moviebox.ph/",
  "https://www.movieboxpro.app/",
  "https://fmoviesunblocked.net/",
];

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type",
  "Access-Control-Expose-Headers":
    "Content-Range, Content-Length, Accept-Ranges, Content-Type",
};

export default {
  async fetch(request: Request): Promise<Response> {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: { ...CORS_HEADERS, "Access-Control-Max-Age": "86400" },
      });
    }

    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");

    if (!targetUrl) {
      return new Response("Missing url parameter", {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    // Validate URL format
    try {
      new URL(targetUrl);
    } catch {
      return Response.json(
        { error: "invalid_url", message: "Invalid target URL format" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const clientReferer = url.searchParams.get("referer");
    const range = request.headers.get("range");

    // Build referer list: client-provided first, then fallback pool
    const referersToTry = clientReferer
      ? [clientReferer, ...REFERER_POOL.filter((r) => r !== clientReferer)]
      : REFERER_POOL;

    let lastStatus = 0;
    let lastError = "";

    for (const referer of referersToTry) {
      try {
        let origin = "https://videodownloader.site";
        try {
          origin = new URL(referer).origin;
        } catch {
          try {
            origin = new URL(
              referer.includes("://") ? referer : `https://${referer}`
            ).origin;
          } catch {
            // Use default
          }
        }

        const headers = new Headers();
        headers.set("Referer", referer);
        headers.set("Origin", origin);
        headers.set(
          "User-Agent",
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
        );
        headers.set("Accept", "video/mp4,video/*;q=0.9,*/*;q=0.8");
        headers.set("Accept-Encoding", "identity");
        if (range) {
          headers.set("Range", range);
        }

        const upstreamReq = new Request(targetUrl, {
          method: "GET",
          headers,
          redirect: "follow",
        });

        const upstream = await fetch(upstreamReq);
        lastStatus = upstream.status;

        // Skip to next referer on auth/gone failures
        if ([403, 404, 410].includes(upstream.status)) {
          continue;
        }
        if (upstream.status >= 500) {
          continue;
        }

        // Build response headers — forward key headers from upstream
        const resHeaders = new Headers(CORS_HEADERS);
        const forwardHeaders = [
          "content-type",
          "content-length",
          "content-range",
          "accept-ranges",
          "etag",
          "last-modified",
        ];
        for (const h of forwardHeaders) {
          const v = upstream.headers.get(h);
          if (v) resHeaders.set(h, v);
        }

        if (!resHeaders.has("accept-ranges")) {
          resHeaders.set("accept-ranges", "bytes");
        }
        if (!resHeaders.has("content-type")) {
          resHeaders.set("content-type", "video/mp4");
        }

        // Support download mode
        const download = url.searchParams.get("download");
        const filename = url.searchParams.get("filename");
        if (download === "true" || filename) {
          const safeFilename = (filename || "video.mp4")
            .replace(/["\\]/g, "")
            .replace(/[^\x20-\x7E]/g, "_");
          resHeaders.set(
            "Content-Disposition",
            `attachment; filename="${safeFilename}"`
          );
        }

        // Cache successful video responses at CF edge for 1 hour.
        // This means repeated seeks/reloads of the same URL are served from
        // CF cache instead of hitting the upstream CDN again.
        resHeaders.set("Cache-Control", "public, max-age=3600, s-maxage=3600");

        return new Response(upstream.body, {
          status: upstream.status,
          headers: resHeaders,
        });
      } catch (err: unknown) {
        lastError = err instanceof Error ? err.message : "Unknown fetch error";
        continue;
      }
    }

    // All referers failed
    if ([403, 404, 410].includes(lastStatus)) {
      return Response.json(
        {
          error: "cdn_rejected",
          cdnStatus: lastStatus,
          tried: referersToTry.length,
          message: "CDN rejected all referer attempts. Token may have expired.",
        },
        { status: 422, headers: CORS_HEADERS }
      );
    }

    return Response.json(
      {
        error: "proxy_error",
        message: lastError || "Stream unavailable from all mirrors",
        cdnStatus: lastStatus || 502,
      },
      { status: 502, headers: CORS_HEADERS }
    );
  },
};
