// ─── KIXO Service Worker v3 ───────────────────────────────────────────────────
// Cache strategy:
//   _next/static/*   → Cache-First (content-hashed filenames = safe forever)
//   /icon-*.png      → Cache-First (static PWA assets)
//   /manifest        → Network-First (may change on deploy)
//   /api/*           → Network-Only  (API responses must never be stale)
//   Page navigations → Network-First (always get fresh HTML, offline fallback)
//   Everything else  → Stale-While-Revalidate

const STATIC_CACHE  = "kixo-static-v3";   // versioned JS/CSS chunks
const DYNAMIC_CACHE = "kixo-dynamic-v3";  // images, icons, etc.
const OFFLINE_PAGE  = "/";

// Install: pre-cache offline fallback and critical static assets
self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(DYNAMIC_CACHE).then((cache) =>
            cache.addAll([
                OFFLINE_PAGE,
                "/icon-192.png",
                "/icon-512.png",
                "/icon-maskable-192.png",
                "/icon-maskable-512.png",
            ]),
        ),
    );
    self.skipWaiting();
});

// Activate: purge all old caches from previous versions
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((k) => k !== STATIC_CACHE && k !== DYNAMIC_CACHE)
                    .map((k) => caches.delete(k)),
            ),
        ),
    );
    self.clients.claim();
});

self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") return;

    const url = new URL(event.request.url);

    // Only intercept same-origin requests
    if (url.origin !== self.location.origin) return;

    const path = url.pathname;

    // ── Network-Only: API routes ──────────────────────────────────────────────
    // API responses must always be fresh (stream URLs expire, data changes)
    if (path.startsWith("/api/") || path === "/sw.js") {
        return; // let the browser handle it normally
    }

    // ── Cache-First: versioned Next.js static assets (_next/static/) ─────────
    // These files have content hashes in their names (e.g. abc123.js),
    // so if the filename is the same, the content is guaranteed identical.
    // Cache them forever on first load — blazing fast on repeat visits.
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

    // ── Network-First: HTML page navigations ──────────────────────────────────
    // Always fetch fresh HTML so the user gets the latest deploy.
    // Fall back to cached home page only when completely offline.
    if (event.request.mode === "navigate") {
        event.respondWith(
            fetch(event.request).catch(() =>
                caches.match(OFFLINE_PAGE).then((r) => r || Response.error()),
            ),
        );
        return;
    }

    // ── Stale-While-Revalidate: icons, images, fonts ──────────────────────────
    // Serve from cache immediately, refresh in background.
    event.respondWith(
        caches.open(DYNAMIC_CACHE).then((cache) => {
            return cache.match(event.request).then((cached) => {
                const networkFetch = fetch(event.request)
                    .then((response) => {
                        if (response.ok && response.type === "basic") {
                            cache.put(event.request, response.clone());
                        }
                        return response;
                    })
                    .catch(() => cached);

                return cached || networkFetch;
            });
        }),
    );
});
