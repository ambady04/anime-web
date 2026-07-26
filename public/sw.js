// ─── KIXO Service Worker v6 ───────────────────────────────────────────────────
// Strategy:
//   /api/*                    → Network-Only (video & data must bypass SW completely)
//   /_next/static/*           → Cache-First (hashed filenames, immutable)
//   External CDN images       → Cache-First (poster URLs are static, never change)
//   Page navigations          → Network-First (fresh HTML, offline fallback)

const STATIC_CACHE = "kixo-static-v6";
const IMAGE_CACHE = "kixo-images-v1";
const IMAGE_CACHE_MAX_ENTRIES = 500;

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

    // ── Network-Only: All API routes (including /api/video) pass through directly ──

    // ── EXTERNAL CDN IMAGES (poster artwork) ──────────────────────────────────
    // Movie posters from pbcdnw.aoneroom.com etc. are static URLs that never
    // change. Cache-First with NO background revalidation — fetch once, done.
    // This prevents the fetch loop that was killing bandwidth.
    if (
        !isSameOrigin &&
        (url.hostname.includes("aoneroom.com") ||
            url.hostname.includes("hakunaymatata.com") ||
            url.hostname.includes("tmdb.org"))
    ) {
        // Only cache images, not video streams from these domains
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
        // Non-image from CDN (e.g. subtitle files) — don't cache, pass through
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
                caches.match(OFFLINE_PAGE).then((r) => r || Response.error()),
            ),
        );
        return;
    }

    // ── Cache-First: same-origin static (fonts, icons, manifest) ──────────────
    // These rarely change. Cache once, no background refetch.
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
