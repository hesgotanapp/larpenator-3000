// Bump when the caching strategy changes; the activate step clears older caches.
const CACHE_NAME = 'larpenator-mobile-v2';
const SHELL_FILES = [
  'index.html',
  'app.js',
  'sync.js',
  'firebase-config.js',
  'manifest.json',
  'vendor/firebase/firebase-app-compat.js',
  'vendor/firebase/firebase-auth-compat.js',
  'vendor/firebase/firebase-firestore-compat.js',
  'icons/icon-192.png',
  'icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(names => Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))))
  );
  self.clients.claim();
});

// Network-first for this site's own files: every launch picks up the latest
// deploy when online, and the cached copy is only used offline. (Cache-first
// kept the phone on whatever version it installed first.)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  event.respondWith(
    fetch(event.request, { cache: 'no-cache' })
      .then(res => {
        if (res && res.ok) { const copy = res.clone(); caches.open(CACHE_NAME).then(c => c.put(event.request, copy)); }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
