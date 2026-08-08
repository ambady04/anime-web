// ─── KIXO Service Worker v8 ───────────────────────────────────────────────────
// Strategy:
//   1. /api/video                  → Intercept & issue direct browser fetch to CDN with Referer header
//   2. hakunaymatata.com (images)   → Cache-First
//   3. /api/* (other)              → Network-Only
//   4. /_next/static/*              → Cache-First (hashed filenames, immutable)
//   5. External CDN images          → Cache-First (poster URLs are static)
//   6. Page navigations             → Network-First (fresh HTML, offline fallback)

const STATIC_CACHE = "kixo-static-v12";
const IMAGE_CACHE = "kixo-images-v1";
const IMAGE_CACHE_MAX_ENTRIES = 500;
const VIDEO_REFERER = "https://videodownloader.site/";

self.addEventListener("install", (event) => {
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    const keep = [STATIC_CACHE, IMAGE_CACHE];
    event.waitUntil(
        caches
            .keys()
            .then((keys) =>
                Promise.all(
                    keys
                        .filter((k) => !keep.includes(k))
                        .map((k) => caches.delete(k)),
                ),
            ),
    );
    self.clients.claim();
});

async function trimCache(cacheName, maxEntries) {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxEntries) {
        const toDelete = keys.slice(0, keys.length - maxEntries);
        await Promise.all(toDelete.map((req) => cache.delete(req)));
    }
}

self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") return;

    const url = new URL(event.request.url);
    const isSameOrigin = url.origin === self.location.origin;

    // ── 1. INTERCEPT /api/video SAME-ORIGIN STREAM REQUESTS ─────────────────────
    // Intercept video proxy requests and issue direct browser fetch to CDN with Referer.
    // Bypasses Vercel serverless timeouts/limits and server IP blocking on Hakunaymatata.
    if (isSameOrigin && url.pathname === "/api/video") {
        const targetUrl = url.searchParams.get("url");
        if (targetUrl) {
            event.respondWith(
                (async () => {
                    const refererUrl =
                        url.searchParams.get("referer") || VIDEO_REFERER;
                    const rangeHeader = event.request.headers.get("range");

                    const fetchHeaders = new Headers();
                    fetchHeaders.set(
                        "User-Agent",
                        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
                    );
                    fetchHeaders.set("Accept", "*/*");
                    if (rangeHeader) {
                        fetchHeaders.set("Range", rangeHeader);
                    }

                    try {
                        const directReq = new Request(targetUrl, {
                            method: "GET",
                            headers: fetchHeaders,
                            referrer: refererUrl,
                            referrerPolicy: "unsafe-url",
                            mode: "cors",
                            credentials: "omit",
                        });

                        const res = await fetch(directReq);

                        if (res.ok || res.status === 206) {
                            const newHeaders = new Headers(res.headers);
                            newHeaders.set("Access-Control-Allow-Origin", "*");
                            newHeaders.set(
                                "Access-Control-Expose-Headers",
                                "Content-Range, Content-Length, Accept-Ranges, Content-Type",
                            );
                            if (!newHeaders.has("content-type")) {
                                newHeaders.set("content-type", "video/mp4");
                            }
                            newHeaders.delete("content-disposition");

                            return new Response(res.body, {
                                status: res.status,
                                statusText: res.statusText,
                                headers: newHeaders,
                            });
                        }
                    } catch {
                        // Fallback to server endpoint if direct browser SW fetch fails
                    }

                    return fetch(event.request);
                })(),
            );
            return;
        }
    }

    // ── 2. VIDEO CDN DIRECT DOMAIN REQUESTS ──────────────────────────────────
    const isVideoCdnDomain =
        !isSameOrigin &&
        (url.hostname.includes("hakunaymatata.com") ||
            url.hostname.includes("aoneroom.com") ||
            url.hostname.includes("moviebox"));

    if (isVideoCdnDomain) {
        const accept = event.request.headers.get("accept") || "";
        const isImage =
            accept.includes("image") ||
            /\.(jpg|jpeg|png|webp|gif|avif)(\?|$)/i.test(url.pathname);

        if (isImage) {
            event.respondWith(
                caches.open(IMAGE_CACHE).then(async (cache) => {
                    const cached = await cache.match(event.request);
                    if (cached) return cached;
                    try {
                        const response = await fetch(event.request);
                        if (response.ok) {
                            cache
                                .put(event.request, response.clone())
                                .then(() =>
                                    trimCache(
                                        IMAGE_CACHE,
                                        IMAGE_CACHE_MAX_ENTRIES,
                                    ),
                                );
                        }
                        return response;
                    } catch {
                        return cached || new Response("", { status: 408 });
                    }
                }),
            );
            return;
        }

        // Direct media stream fetch: inject Referer header
        const rangeHeader = event.request.headers.get("range");
        const fetchHeaders = new Headers(event.request.headers);
        if (rangeHeader) fetchHeaders.set("Range", rangeHeader);

        event.respondWith(
            (async () => {
                try {
                    const req = new Request(event.request.url, {
                        method: "GET",
                        headers: fetchHeaders,
                        referrer: VIDEO_REFERER,
                        referrerPolicy: "unsafe-url",
                        mode: "cors",
                    });
                    const res = await fetch(req);
                    if (res.ok || res.status === 206) {
                        return res;
                    }
                } catch {
                    // Ignore
                }
                return fetch(event.request);
            })(),
        );
        return;
    }

    // ── 3. OTHER EXTERNAL CDN IMAGES (aoneroom.com, tmdb.org) ─────────────────
    if (
        !isSameOrigin &&
        (url.hostname.includes("aoneroom.com") ||
            url.hostname.includes("tmdb.org"))
    ) {
        const accept = event.request.headers.get("accept") || "";
        const isImage =
            accept.includes("image") ||
            /\.(jpg|jpeg|png|webp|gif|avif)(\?|$)/i.test(url.pathname);

        if (isImage) {
            event.respondWith(
                caches.open(IMAGE_CACHE).then(async (cache) => {
                    const cached = await cache.match(event.request);
                    if (cached) return cached;
                    try {
                        const response = await fetch(event.request);
                        if (response.ok) {
                            cache
                                .put(event.request, response.clone())
                                .then(() =>
                                    trimCache(
                                        IMAGE_CACHE,
                                        IMAGE_CACHE_MAX_ENTRIES,
                                    ),
                                );
                        }
                        return response;
                    } catch {
                        return cached || new Response("", { status: 408 });
                    }
                }),
            );
            return;
        }
        return;
    }

    // From here, only same-origin requests
    if (!isSameOrigin) return;

    const path = url.pathname;

    // ── 4. Network-Only API & Worker ──────────────────────────────────────────
    if ((path.startsWith("/api/") && path !== "/api/video") || path === "/sw.js") {
        return;
    }

    // ── 5. Cache-First: versioned static assets ───────────────────────────────
    if (path.startsWith("/_next/static/")) {
        event.respondWith(
            caches.open(STATIC_CACHE).then(async (cache) => {
                const cached = await cache.match(event.request);
                if (cached) return cached;
                const response = await fetch(event.request);
                if (response.ok) {
                    cache.put(event.request, response.clone());
                }
                return response;
            }),
        );
        return;
    }

    // ── 6. Network-First: HTML navigations ────────────────────────────────────
    if (event.request.mode === "navigate") {
        event.respondWith(
            fetch(event.request).catch(() =>
                caches.match("/").then((r) => r || Response.error()),
            ),
        );
        return;
    }

    // ── 7. Cache-First: same-origin static (fonts, icons, manifest) ───────────
    event.respondWith(
        caches.open(STATIC_CACHE).then(async (cache) => {
            const cached = await cache.match(event.request);
            if (cached) return cached;
            try {
                const response = await fetch(event.request);
                if (response.ok && response.type === "basic") {
                    cache.put(event.request, response.clone());
                }
                return response;
            } catch {
                return cached || new Response("", { status: 408 });
            }
        }),
    );
});
