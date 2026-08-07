const CACHE_NAME = 'larpenator-mobile-v1';
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

// App-shell files: cache-first (instant offline load).
// Everything else (Firestore/Auth network calls, fonts): network-first, so
// data always tries to be fresh, falling back to cache only if offline.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isShellFile = url.origin === location.origin && SHELL_FILES.some(f => url.pathname.endsWith('/' + f) || url.pathname.endsWith(f));

  if (isShellFile) {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
    return;
  }

  if (url.origin === location.origin) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
  }
});
