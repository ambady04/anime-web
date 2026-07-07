import { NextRequest } from 'next/server';

// Node.js runtime so maxDuration:60 in vercel.json applies.
// Edge runtime has a hard 25s wall-time limit which kills slow CDN connections on mobile.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return new Response('Missing url parameter', { status: 400 });
  }

  const range = req.headers.get('range');

  const upstreamHeaders: Record<string, string> = {
    'Referer':         'https://videodownloader.site/',
    'Origin':          'https://videodownloader.site',
    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept':          '*/*',
    'Accept-Encoding': 'identity',  // prevent gzip so Content-Length is accurate
  };

  if (range) {
    upstreamHeaders['Range'] = range;
  }

  // 55-second abort — just under Vercel's 60s maxDuration so we get a clean 504
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55_000);

  try {
    const upstream = await fetch(targetUrl, {
      headers: upstreamHeaders,
      signal:  controller.signal,
      // @ts-expect-error duplex is valid in Node 18 fetch
      duplex:  'half',
    });

    clearTimeout(timeout);

    // CDN hard-rejected the URL — tell the client to fall back to the next quality
    if ([403, 404, 410].includes(upstream.status)) {
      return new Response(
        JSON.stringify({ error: 'cdn_rejected', cdnStatus: upstream.status }),
        {
          status: 422,
          headers: {
            'Content-Type':                'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        }
      );
    }

    const resHeaders = new Headers();

    for (const h of [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
      'etag',
      'last-modified',
    ]) {
      const v = upstream.headers.get(h);
      if (v) resHeaders.set(h, v);
    }

    // Always advertise range support — required by iOS Safari before it will stream
    if (!resHeaders.has('accept-ranges')) {
      resHeaders.set('accept-ranges', 'bytes');
    }

    resHeaders.set('Access-Control-Allow-Origin', '*');
    resHeaders.set('Cache-Control', 'public, max-age=3600');
    resHeaders.set('X-Accel-Buffering', 'no');   // stop Vercel/nginx from buffering

    // Pipe body straight through — no buffering, no arrayBuffer()
    return new Response(upstream.body as ReadableStream, {
      status:  upstream.status,
      headers: resHeaders,
    });

  } catch (err: any) {
    clearTimeout(timeout);
    if (err?.name === 'AbortError') {
      return new Response('Upstream CDN timed out', { status: 504 });
    }
    console.error('Video proxy error:', err?.message ?? err);
    return new Response('Error loading stream', { status: 502 });
  }
}
