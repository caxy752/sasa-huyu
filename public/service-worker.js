// MakotiTraders PWA Service Worker
// Bump CACHE_VERSION on every deployment to refresh caches.
const CACHE_VERSION = 'v3';
const CACHE_NAME = `makoti-pwa-cache-${CACHE_VERSION}`;
const API_CACHE = `makoti-api-cache-${CACHE_VERSION}`;

const STATIC_ASSET = /\.(js|css|woff2?|ttf|eot|png|jpg|jpeg|gif|svg|ico|webp)(\?.*)?$/i;
const API_ROUTES = ['/api/', '//api.', '//ws.', '/translations/'];

// Skip waiting so new SW activates immediately for all clients.
self.addEventListener('install', event => {
    self.skipWaiting();
});

// Delete all old caches, then take control.
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME && k !== API_CACHE).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const { method } = event.request;
    if (method !== 'GET') return;

    const url = new URL(event.request.url);
    const path = url.pathname;

    // --- Network-first for HTML (always get latest, fall back to cache) ---
    if (event.request.mode === 'navigate' || path === '/' || path.endsWith('.html')) {
        event.respondWith(networkFirst(event.request, CACHE_NAME));
        return;
    }

    // --- Cache-first for static assets (JS, CSS, fonts, images) ---
    if (STATIC_ASSET.test(path)) {
        event.respondWith(cacheFirst(event.request, CACHE_NAME));
        return;
    }

    // --- Network-first for API / translations (serve cached on failure) ---
    if (API_ROUTES.some(route => path.includes(route) || url.href.includes(route))) {
        event.respondWith(networkFirst(event.request, API_CACHE));
        return;
    }
});

async function networkFirst(request, cacheName) {
    try {
        const response = await fetch(request);
        if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(cacheName).then(cache => cache.put(request, copy));
        }
        return response;
    } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        // Final fallback: serve index.html for navigation
        if (request.mode === 'navigate') {
            return caches.match('/index.html');
        }
        return new Response('Offline', { status: 503 });
    }
}

async function cacheFirst(request, cacheName) {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
        const response = await fetch(request);
        if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(cacheName).then(cache => cache.put(request, copy));
        }
        return response;
    } catch {
        return new Response('Offline', { status: 503 });
    }
}
