const CACHE = 'routeheat-v1011-r1';
const APP = [
  "./",
  "./index.html",
  "./privacy.html",
  "./manifest.webmanifest",
  "./assets/icon-192-v4.png",
  "./assets/icon-512-v4.png",
  "./assets/vendor/leaflet/leaflet.css?v=1.9.4-rh700",
  "./assets/route-delays.css?v=10.1.1-r1",
  "./assets/styles.css?v=10.1.1-r1",
  "./assets/routeheat-7.css?v=10.1.1-r1",
  "./assets/routeheat-8.css?v=10.1.1-r1",
  "./assets/routeheat-themes-9.css?v=10.1.1-r1",
  "./assets/drive-studio.css?v=10.1.1-r1",
  "./assets/package-controls.css?v=10.1.1-r1",
  "./assets/package-insights.css?v=10.1.1-r1",
  "./assets/pitstops.css?v=10.1.1-r1",
  "./assets/route-atmosphere-910.css?v=10.1.1-r1",
  "./assets/calendar-summary.css?v=10.1.1-r1",
  "./assets/polish-910.css?v=10.1.1-r1",
  "./assets/timeline-910.css?v=10.1.1-r1",
  "./assets/drive-controls-920.css?v=10.1.1-r1",
  "./assets/atlas-1000.css?v=10.1.1-r1",
  "./assets/drive-1000.css?v=10.1.1-r1",
  "./assets/drive-1010.css?v=10.1.1-r1",
  "./assets/vendor/leaflet/leaflet.js?v=1.9.4-rh700",
  "./assets/vendor/leaflet/leaflet-heat.js?v=0.2.0-rh700",
  "./assets/supabase-config.js?v=10.1.1-r1",
  "./assets/route-atmosphere.js?v=10.1.1-r1",
  "./assets/routeheat-pitstops.js?v=10.1.1-r1",
  "./assets/route-intake.js?v=10.1.1-r1",
  "./assets/pace-orchestra.js?v=10.1.1-r1",
  "./assets/route-delays.js?v=10.1.1-r1",
  "./assets/routeheat-packages.js?v=10.1.1-r1",
  "./assets/routeheat-package-insights.js?v=10.1.1-r1",
  "./assets/routeheat-customize.js?v=10.1.1-r1",
  "./assets/routeheat-day-summary.js?v=10.1.1-r1",
  "./assets/routeheat-atlas-focus.js?v=10.1.1-r1",
  "./assets/routeheat-timeline.js?v=10.1.1-r1",
  "./assets/routeheat-projections.js?v=10.1.1-r1",
  "./assets/routeheat-drive-grid.js?v=10.1.1-r1",
  "./assets/routeheat-drive-viewport.js?v=10.1.1-r1",
  "./assets/routeheat-drive-controls.js?v=10.1.1-r1",
  "./assets/routeheat-tote-sound.js?v=10.1.1-r1",
  "./assets/app.js?v=10.1.1-r1",
  "./assets/cloud.js?v=10.1.1-r1",
  "./assets/routeheat-storage.js?v=10.1.1-r1",
  "./assets/vendor/leaflet/images/layers.png",
  "./assets/vendor/leaflet/images/layers-2x.png",
  "./assets/vendor/leaflet/images/marker-icon.png",
  "./assets/vendor/leaflet/images/marker-icon-2x.png",
  "./assets/vendor/leaflet/images/marker-shadow.png"
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

  // The policy is a separate document; never let it replace the offline app shell.
  const navigationUrl = new URL(request.url);
  const policyUrl = new URL('./privacy.html', self.location.href);
  if (request.mode === 'navigate' && navigationUrl.origin === policyUrl.origin && navigationUrl.pathname === policyUrl.pathname) {
    event.respondWith(
      fetch(request).then(response => {
        if (response.ok) event.waitUntil(caches.open(CACHE).then(cache => cache.put('./privacy.html', response.clone())));
        return response;
      }).catch(async () => (await caches.match('./privacy.html')) || Response.error())
    );
    return;
  }

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
