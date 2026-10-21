importScripts('./reminders.js');

const CACHE_NAME = 'motoradar-v2';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './reminders.js',
  './manifest.json',
  './js/logic.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './events.json'
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
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  let url = new URL(e.request.url);
  if (url.pathname.endsWith('events.json')) {
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

function runReminderCheck() {
  return self.MotoReminders.check((title, options) =>
    self.registration.showNotification(title, options)
  ).catch((err) => console.log('Reminder check failed:', err));
}

self.addEventListener('periodicsync', (e) => {
  if (e.tag === 'motoradar-reminders') {
    e.waitUntil(runReminderCheck());
  }
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || './index.html';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
