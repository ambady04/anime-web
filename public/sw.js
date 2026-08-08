// ─── KIXO Service Worker v7 ───────────────────────────────────────────────────
// Strategy:
//   hakunaymatata.com (video CDN) → Intercept + re-issue with correct Referer
//   hakunaymatata.com (images)    → Cache-First
//   /api/*                        → Network-Only
//   /_next/static/*               → Cache-First (hashed filenames, immutable)
//   External CDN images           → Cache-First (poster URLs are static)
//   Page navigations              → Network-First (fresh HTML, offline fallback)
//
// WHY: The video CDN (bcdnxw.hakunaymatata.com) only allows playback when
// Referer is https://videodownloader.site/. Browsers send the page origin
// as Referer by default, which the CDN rejects with 429. This SW intercepts
// those requests and re-issues them with the correct Referer so the CDN
// hotlink protection passes — without needing any server-side proxy.

const STATIC_CACHE = "kixo-static-v10";
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

    // ── VIDEO CDN (hakunaymatata.com, aoneroom.com, moviebox.ph, etc.) ───────
    // Re-issue with correct Referer so the CDN hotlink protection passes.
    // The browser normally sends the page URL as Referer → CDN returns 429.
    // We override it to videodownloader.site which is in the CDN's allowlist.
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
            // Cache poster/thumbnail images from this CDN
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
                                    trimCache(IMAGE_CACHE, IMAGE_CACHE_MAX_ENTRIES),
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

        // Pass non-image requests (all video streams route via /api/video proxy route)
        return;
    }

    // ── OTHER EXTERNAL CDN IMAGES (aoneroom.com, tmdb.org) ────────────────────
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
                                    trimCache(IMAGE_CACHE, IMAGE_CACHE_MAX_ENTRIES),
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
        // Non-image from other CDN (subtitle files etc.) — pass through
        return;
    }

    // From here, only same-origin requests
    if (!isSameOrigin) return;

    const path = url.pathname;

    // ── Network-Only: API routes ──────────────────────────────────────────────
    if (path.startsWith("/api/") || path === "/sw.js") {
        return;
    }

    // ── Cache-First: versioned static assets ──────────────────────────────────
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

    // ── Network-First: HTML navigations ───────────────────────────────────────
    if (event.request.mode === "navigate") {
        event.respondWith(
            fetch(event.request).catch(() =>
                caches.match("/").then((r) => r || Response.error()),
            ),
        );
        return;
    }

    // ── Cache-First: same-origin static (fonts, icons, manifest) ──────────────
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
