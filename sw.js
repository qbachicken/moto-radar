const CACHE_NAME = 'motoradar-v2';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './js/logic.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  let url = new URL(e.request.url);
  if (url.pathname.endsWith('events.json')) {
    // Network first for events data
    e.respondWith(
      fetch(e.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          let clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        }
        return networkResponse;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache first for shell assets
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        fetch(e.request).then((netResp) => {
          if (netResp && netResp.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, netResp));
          }
        }).catch(() => {});
        return cachedResponse;
      }
      return fetch(e.request).then((netResp) => {
        let clone = netResp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, clone));
        return netResp;
      });
    })
  );
});
