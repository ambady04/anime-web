// Bumping this version purges ALL previously cached assets on activate.
// (Raised to v2 to evict stale /_next/ JS chunks that a prior cache-first
//  strategy was serving even after code changes.)
const CACHE_NAME = "kixo-cache-v2";
const OFFLINE_FALLBACK = "/";

self.addEventListener("install", (event) => {
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                }),
            );
        }),
    );
    self.clients.claim();
});

self.addEventListener("fetch", (event) => {
    // Only handle same-origin GET requests
    if (event.request.method !== "GET") return;

    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;

    // NEVER cache app code, build artifacts, or API responses.
    // These change between builds; caching them serves stale JS/CSS and breaks
    // updates. Always go straight to the network (no SW handling at all).
    if (
        url.pathname.startsWith("/_next/") ||
        url.pathname.startsWith("/api/") ||
        url.pathname === "/sw.js"
    ) {
        return; // let the browser handle it normally (network + HTTP cache)
    }

    // For HTML page navigations, always try the network first so users get the
    // latest page; fall back to the cached home shell only when offline.
    if (event.request.mode === "navigate") {
        event.respondWith(
            fetch(event.request).catch(() => {
                return caches.match(OFFLINE_FALLBACK) || Response.error();
            }),
        );
        return;
    }

    // For other static assets (images, fonts, icons) use stale-while-revalidate:
    // serve from cache for speed, but refresh the cache copy in the background.
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const networkFetch = fetch(event.request)
                .then((response) => {
                    if (
                        response &&
                        response.status === 200 &&
                        response.type === "basic"
                    ) {
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseToCache);
                        });
                    }
                    return response;
                })
                .catch(() => cachedResponse);

            return cachedResponse || networkFetch;
        }),
    );
});
