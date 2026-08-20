// ─── KIXO Service Worker v17 ─────────────────────────────────────────────────
// Strategy:
//   1. /api/*                        → Network-Only (Pass through directly to Vercel API routes)
//   1.5 External CDN Videos          → Intercept & Attach valid Referer on client residential IP
//   2. External CDN images           → Cache-First (Poster thumbnails)
//   3. /_next/static/*               → Network-First (Fresh JS/CSS bundles on new deployments)
//   4. Page navigations              → Network-First (Fresh HTML, offline fallback)

const STATIC_CACHE = "kixo-static-v18";
const IMAGE_CACHE = "kixo-images-v3";
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

    // ── 1. ALL API ROUTES & SERVICE WORKER → Network-Only (No SW interception) ───
    if (
        isSameOrigin &&
        (url.pathname.startsWith("/api/") || url.pathname === "/sw.js")
    ) {
        return;
    }

    // ── 1.5. EXTERNAL CDN VIDEO STREAMS → Intercept & inject valid Referer header ─
    if (
        !isSameOrigin &&
        (url.hostname.includes("hakunaymatata.com") ||
            url.hostname.includes("aoneroom.com"))
    ) {
        const isVideo =
            /\.(mp4|m3u8|ts|webm)(\?|$)/i.test(url.pathname) ||
            url.pathname.includes("/bt/") ||
            url.pathname.includes("/resource/");

        if (isVideo) {
            event.respondWith(
                (async () => {
                    const range = event.request.headers.get("range");
                    const headers = {};
                    if (range) headers["Range"] = range;
                    try {
                        const resp = await fetch(event.request.url, {
                            headers,
                            referrer: "https://videodownloader.site/",
                            referrerPolicy: "unsafe-url",
                        });
                        return resp;
                    } catch {
                        return fetch(event.request);
                    }
                })(),
            );
            return;
        }
    }

    // ── 2. EXTERNAL CDN IMAGES (hakunaymatata.com, aoneroom.com, tmdb.org) ───────
    if (!isSameOrigin) {
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

    const path = url.pathname;

    // ── 3. Network-First: versioned static assets (Fresh JS/CSS bundles) ─────────
    if (path.startsWith("/_next/static/")) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    if (response.ok) {
                        const copy = response.clone();
                        caches
                            .open(STATIC_CACHE)
                            .then((cache) => cache.put(event.request, copy));
                    }
                    return response;
                })
                .catch(() =>
                    caches
                        .match(event.request)
                        .then((r) => r || Response.error()),
                ),
        );
        return;
    }

    // ── 4. Network-First: HTML navigations ────────────────────────────────────
    if (event.request.mode === "navigate") {
        event.respondWith(
            fetch(event.request).catch(() =>
                caches.match("/").then((r) => r || Response.error()),
            ),
        );
        return;
    }

    // ── 5. Cache-First: same-origin static (fonts, icons, manifest) ───────────
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
