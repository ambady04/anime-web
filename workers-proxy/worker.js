/**
 * Cloudflare Worker — Video Proxy
 * Proxies video requests to CDN with correct headers.
 * Cloudflare edge IPs are trusted by CDNs (not blocked like datacenter IPs).
 *
 * Deploy: npx wrangler deploy --name video-proxy
 * URL: https://video-proxy.<your-subdomain>.workers.dev/
 *
 * Usage: GET /?url=<encoded_cdn_url>&referer=<referer>
 */

export default {
  async fetch(request) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Range, Content-Type",
      "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges, Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");
    const referer = url.searchParams.get("referer") || "https://videodownloader.site/";

    if (!targetUrl) {
      return new Response(JSON.stringify({ error: "Missing url parameter" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const rangeHeader = request.headers.get("Range") || "";

    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept": "*/*",
      "Accept-Encoding": "identity",
      "Referer": referer,
      "Origin": referer.replace(/\/$/, ""),
      "Sec-Fetch-Dest": "video",
      "Sec-Fetch-Mode": "no-cors",
      "Sec-Fetch-Site": "cross-site",
    };

    if (rangeHeader) {
      headers["Range"] = rangeHeader;
    }

    try {
      const response = await fetch(targetUrl, {
        headers,
        cf: { cacheTtl: 0 },
      });

      if (!response.ok && response.status !== 206) {
        // Try alternate referers
        const altReferers = [
          "https://h5.aoneroom.com/",
          "https://www.google.com/",
        ];
        for (const altRef of altReferers) {
          headers["Referer"] = altRef;
          headers["Origin"] = altRef.replace(/\/$/, "");
          const altResp = await fetch(targetUrl, { headers, cf: { cacheTtl: 0 } });
          if (altResp.ok || altResp.status === 206) {
            const respHeaders = new Headers(altResp.headers);
            Object.entries(corsHeaders).forEach(([k, v]) => respHeaders.set(k, v));
            respHeaders.set("Accept-Ranges", "bytes");
            respHeaders.delete("Content-Disposition");
            return new Response(altResp.body, {
              status: altResp.status,
              headers: respHeaders,
            });
          }
        }
        return new Response(JSON.stringify({ error: "CDN returned " + response.status }), {
          status: 502,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      const respHeaders = new Headers(response.headers);
      Object.entries(corsHeaders).forEach(([k, v]) => respHeaders.set(k, v));
      respHeaders.set("Accept-Ranges", "bytes");
      if (!respHeaders.has("Content-Type")) {
        respHeaders.set("Content-Type", "video/mp4");
      }
      respHeaders.delete("Content-Disposition");

      return new Response(response.body, {
        status: response.status,
        headers: respHeaders,
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  },
};
