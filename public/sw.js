// RoadFix offline support: pages and data are served fresh when online and from
// cache when not; built assets are cached forever (their names change on deploy).
// Live readings and traffic tiles are never cached here, so stale traffic is never shown as live.
const CACHE = "roadfix-v2";
const PRECACHE = ["/", "/pilot", "/method"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/live") || url.pathname.startsWith("/api/tiles")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then((r) => put(e.request, r))));
    return;
  }
  // pages, area data and RoadFix readings: network first, cache as fallback
  e.respondWith(
    fetch(e.request)
      .then((r) => put(e.request, r))
      .catch(() => caches.match(e.request).then((hit) => hit || caches.match("/"))),
  );
});

function put(req, res) {
  if (res.ok) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
}
