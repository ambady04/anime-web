import { NextRequest } from 'next/server';

// Required to enable true streaming – without this Next.js buffers the full body
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return new Response('Missing url parameter', { status: 400 });
  }

  // Pass Range header from browser for seeking / partial-content
  const range = req.headers.get('range');

  const upstreamHeaders: Record<string, string> = {
    'Referer': 'https://videodownloader.site/',
    'Origin':  'https://videodownloader.site',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  if (range) {
    upstreamHeaders['Range'] = range;
  }

  // 30-second abort so a stalled CDN connection doesn't hang the proxy indefinitely
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const upstream = await fetch(targetUrl, {
      headers: upstreamHeaders,
      signal: controller.signal,
      // Prevent Node from buffering the body – stream it directly
      // @ts-expect-error: duplex is a valid fetch option in Node 18+
      duplex: 'half',
    });

    clearTimeout(timeout);

    // CDN rejected – signal the client to fall back to a different quality
    if (upstream.status === 403 || upstream.status === 404 || upstream.status === 410) {
      return new Response(
        JSON.stringify({ error: 'cdn_rejected', status: upstream.status }),
        {
          status: 422,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    // Build response headers – only forward what the browser actually needs
    const resHeaders = new Headers();

    const forward = [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
      'etag',
      'last-modified',
    ];
    for (const h of forward) {
      const v = upstream.headers.get(h);
      if (v) resHeaders.set(h, v);
    }

    // Ensure byte-range serving is advertised so the player can seek
    if (!resHeaders.has('accept-ranges')) {
      resHeaders.set('accept-ranges', 'bytes');
    }

    resHeaders.set('Access-Control-Allow-Origin', '*');

    // Allow aggressive browser caching of video segments (1 hour)
    // Without this every seek causes a full re-fetch through the proxy
    resHeaders.set('Cache-Control', 'public, max-age=3600');

    // Stream the body directly – no intermediate buffering
    return new Response(upstream.body, {
      status: upstream.status,      // 200 or 206 (partial content)
      headers: resHeaders,
    });

  } catch (err: any) {
    clearTimeout(timeout);
    if (err?.name === 'AbortError') {
      return new Response('Upstream CDN timed out', { status: 504 });
    }
    console.error('Video proxy error:', err);
    return new Response('Error loading target stream', { status: 502 });
  }
}
