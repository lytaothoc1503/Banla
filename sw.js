const CACHE = 'banla-v4';
const ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js',
  '/effects.css',
  '/effects.js',
  '/images/banla-exterior.jpg',
  '/images/banla-lobby.jpg',
  '/images/banla-reception.jpg',
  '/images/banla-breakfast.jpg',
  '/images/banla-rooftop.jpg',
  '/rooms.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
