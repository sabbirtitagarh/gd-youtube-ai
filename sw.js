/* GD YouTube AI - service worker (offline shell).
   Network-first: update deploy karte hi naya code mil jata hai; offline par cache se chalta hai.
   Google/API calls kabhi cache nahi hote. */
const VERSION = 'gdyt-v1.1.2';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/config.js', 'js/prompt.js', 'js/ai.js', 'js/thumb.js', 'js/drive.js', 'js/app.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-192.png', 'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png', 'icons/favicon-32.png', 'icons/favicon-64.png',
  'icons/logo.png', 'icons/mascot.png', 'icons/og-banner.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => Promise.all(SHELL.map((u) =>
        fetch(new Request(u, { cache: 'reload' })).then((r) => (r.ok ? c.put(u, r) : null)).catch(() => null)
      )))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== self.location.origin && !isFont) return;

  // Fonts: cache-first
  if (isFont) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res && res.status === 200) { const c = res.clone(); caches.open(VERSION).then((x) => x.put(req, c)); }
        return res;
      }))
    );
    return;
  }

  // App files: network-first (HTTP cache bypass), offline par cache
  e.respondWith(
    fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }))
      .then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req.mode === 'navigate' ? 'index.html' : req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : undefined))
      )
  );
});
