// sw.js
// Service worker: makes Sonder work offline and pick up updates.
// To ship an update, change files and bump VERSION here (any byte change to this file triggers the update).
const VERSION = '1.2.0';
const CACHE = `sonder-${VERSION}`;
const SHELL = [
  './', 'index.html', 'styles.css', 'app.js', 'db.js', 'icons.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png'
];

// Mood icons are cached too, but a missing/misnamed one won't break the install.
const MOOD_ICONS = ['lotus-flower', 'positivity', 'mirror', 'sun', 'sleep'].map((n) => `icons/${n}.png`);

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL).then(() => Promise.allSettled(MOOD_ICONS.map((u) => c.add(u)))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first (so updates arrive as soon as you're online), cache as the offline fallback.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('index.html')))
  );
});
