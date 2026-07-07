import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return new NextResponse('Missing url parameter', { status: 400 });
  }

  // Retrieve byte range header sent by browser player for seeking/buffering
  const range = req.headers.get('range');

  const headers: Record<string, string> = {
    'Referer': 'https://videodownloader.site/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  if (range) {
    headers['Range'] = range;
  }

  try {
    const videoResponse = await fetch(targetUrl, {
      headers,
    });

    const responseHeaders = new Headers();
    
    // Copy critical streaming headers from CDN
    ['content-type', 'content-length', 'accept-ranges', 'content-range', 'etag', 'last-modified'].forEach((h) => {
      const val = videoResponse.headers.get(h);
      if (val) responseHeaders.set(h, val);
    });

    // Set CORS policies to allow HTML5 player loading
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    
    // Disable server caching of media chunks
    responseHeaders.set('Cache-Control', 'no-cache, no-store, must-revalidate');

    // Read body as ArrayBuffer to prevent Next.js from forcing Transfer-Encoding: chunked
    // which breaks video playback on iOS Safari/mobile browsers.
    const buffer = await videoResponse.arrayBuffer();

    return new Response(buffer, {
      status: videoResponse.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('Video proxy stream error:', error);
    return new Response('Error loading target stream', { status: 500 });
  }
}
