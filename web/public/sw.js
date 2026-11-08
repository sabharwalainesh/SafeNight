// SafeNight app-shell cache. Cache-first for same-origin static assets only.
// Everything else (SpacetimeDB, bridge, any cross-origin request, any non-GET) is left to the network:
// the handler simply returns without calling respondWith.
const CACHE = 'safenight-shell-v1';
const SHELL = ['./', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function isStatic(url) {
  const base = new URL(self.registration.scope).pathname;
  const path = '/' + url.pathname.slice(base.length);
  return (
    path === '/' ||
    path === '/index.html' ||
    path.startsWith('/assets/') ||
    path === '/manifest.webmanifest' ||
    /^\/(icon|apple-touch-icon)[^/]*\.(png|svg)$/.test(path)
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!isStatic(url)) return;
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});
