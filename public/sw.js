/* GTHO v2 service worker.
 * The quoted stamp below is replaced in dist/sw.js at build time so the
 * worker bytes change every deploy. Do not register this file with a ?v= query.
 */
const STAMP = '__GTHO_BUILD_STAMP__';
const CACHE_NAME = 'gtho-' + STAMP;
const BASE = '/GTHO-v2/';

function networkFirstNavigation(req) {
  return fetch(req)
    .then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
      }
      return res;
    })
    .catch(() => caches.match(req).then((cached) => cached || caches.match(BASE + 'index.html')));
}

function cacheFirstAsset(req) {
  return caches.match(req).then((cached) => {
    if (cached) return cached;
    return fetch(req).then((res) => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
      }
      return res;
    });
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll([BASE, BASE + 'index.html']))
      .catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.startsWith('gtho-') && name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('/sw.js')) return;

  if (url.pathname.endsWith('/version.json')) {
    event.respondWith(fetch(req, { cache: 'reload' }));
    return;
  }

  const accept = req.headers.get('accept') || '';
  const isNavigation = req.mode === 'navigate' || accept.includes('text/html');
  if (isNavigation) {
    event.respondWith(networkFirstNavigation(req));
    return;
  }

  if (url.pathname.includes('/assets/')) {
    event.respondWith(cacheFirstAsset(req));
  }
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
