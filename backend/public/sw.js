const CACHE_NAME = 'ne-pwa-v1';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/pwa-icons/icon-192.png',
  '/pwa-icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener('fetch', (e) => {
  // Only cache same-origin GET requests for static assets
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('/api/')) return; // Don't cache API calls
  
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request).then((response) => {
        // Cache successful static responses
        if (response && response.status === 200 && e.request.url.includes('/assets/')) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
