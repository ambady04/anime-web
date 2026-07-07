// Edge runtime gives us Web Streams API natively and has no cold-start penalty,
// making it the correct choice for a streaming video proxy on Vercel.
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return new Response('Missing url parameter', { status: 400 });
  }

  // Pass the browser's Range header through for seeking / partial-content
  const incomingRange = new Request(req).headers.get('range');

  const upstreamHeaders: Record<string, string> = {
    'Referer': 'https://videodownloader.site/',
    'Origin':  'https://videodownloader.site',
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Encoding': 'identity', // Avoid compressed responses that break Content-Length
  };

  if (incomingRange) {
    upstreamHeaders['Range'] = incomingRange;
  }

  try {
    const upstream = await fetch(targetUrl, {
      headers: upstreamHeaders,
    });

    // CDN permanently rejected the URL — signal client to auto-fallback to next quality
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

    // Build response headers — only forward what the browser player needs
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

    // Advertise byte-range support so the player can seek without re-loading the source
    if (!resHeaders.has('accept-ranges')) {
      resHeaders.set('accept-ranges', 'bytes');
    }

    resHeaders.set('Access-Control-Allow-Origin', '*');
    // Cache video segments for 1 hour — avoids redundant proxy fetches on seeks
    resHeaders.set('Cache-Control', 'public, max-age=3600');
    // Prevent Vercel's edge CDN from buffering the stream
    resHeaders.set('X-Accel-Buffering', 'no');

    // Stream body directly through — no intermediate buffering
    return new Response(upstream.body, {
      status: upstream.status,   // 200 or 206 Partial Content
      headers: resHeaders,
    });

  } catch (err: any) {
    console.error('Video proxy error:', err?.message ?? err);
    return new Response('Error loading stream', { status: 502 });
  }
}
