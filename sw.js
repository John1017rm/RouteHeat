const CACHE = 'routeheat-v720';
const APP = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/styles.css?v=7.2.0',
  './assets/routeheat-7.css?v=7.2.0',
  './assets/app.js?v=7.2.0',
  './assets/cloud.js?v=7.2.0',
  './assets/supabase-config.js?v=7.2.0',
  './assets/routeheat-storage.js?v=7.2.0',
  './assets/route-atmosphere.js?v=7.2.0',
  './assets/route-intake.js?v=7.2.0',
  './assets/pace-orchestra.js?v=7.2.0',
  './assets/watercolor-atlas.js?v=7.2.0',
  './assets/vendor/leaflet/leaflet.css?v=1.9.4-rh700',
  './assets/vendor/leaflet/leaflet.js?v=1.9.4-rh700',
  './assets/vendor/leaflet/leaflet-heat.js?v=0.2.0-rh700',
  './assets/vendor/leaflet/images/layers.png',
  './assets/vendor/leaflet/images/layers-2x.png',
  './assets/vendor/leaflet/images/marker-icon.png',
  './assets/vendor/leaflet/images/marker-icon-2x.png',
  './assets/vendor/leaflet/images/marker-shadow.png',
  './assets/icon-192-v2.png',
  './assets/icon-512-v2.png'
];
const STATIC_DESTINATIONS = new Set(['style', 'script', 'image', 'font', 'manifest']);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP)));
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('routeheat-') && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) caches.open(CACHE).then(cache => cache.put('./index.html', response.clone()));
          return response;
        })
        .catch(async () => (await caches.match('./index.html')) || (await caches.match('./')) || Response.error())
    );
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !STATIC_DESTINATIONS.has(request.destination)) return;

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) caches.open(CACHE).then(cache => cache.put(request, response.clone()));
      return response;
    }))
  );
});
