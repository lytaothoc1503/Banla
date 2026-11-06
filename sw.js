// Banla Service Worker — network-first cho tài nguyên cùng domain, cache làm dự phòng khi offline.
// Đổi CACHE mỗi khi muốn xoá sạch cache cũ trên máy khách.
const CACHE = 'banla-v6';
const ASSETS = [
  './',
  './index.html',
  './payment-result.html',
  './phieu.html',
  './phieu.js',
  './styles.css',
  './script.js',
  './effects.css',
  './effects.js',
  './rooms.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(ASSETS.map((url) => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  // Chỉ xử lý GET cùng domain; API, Supabase, Google Fonts... đi thẳng ra mạng.
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (
    url.origin !== self.location.origin ||
    url.pathname.includes('/api/') ||
    url.pathname.includes('/onepay-return')
  ) {
    return;
  }

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
  );
});
