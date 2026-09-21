// The placeholder below is replaced with a unique id at build time (see
// vite.config.ts, swBuildVersionPlugin). This guarantees the *bytes* of this
// file change on every deploy, so the browser always detects an update and
// swaps the old service worker for the new one — even if nobody remembers to
// bump a version number by hand.
const CACHE = "career-compass-__BUILD_ID__";

// Read from self.registration.scope rather than hardcoding "/", so this
// works whether the app is served from a domain root or a subpath (e.g.
// GitHub Pages project sites at https://user.github.io/repo-name/).
const scopePath = () => new URL(self.registration.scope).pathname;

self.addEventListener("install", (event) => {
  const base = scopePath();
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([base, `${base}manifest.json`])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

// Only cache a response that actually succeeded. Right after a deploy, an
// already-open page can still ask for an old hashed JS/CSS filename that the
// new build no longer ships, and the server answers with a 404. `fetch()`
// resolves normally for that (it only rejects on a real network failure), so
// without this check that 404 body used to get stored as if it were the
// real file — and since nothing ever expires it, the app would then stay
// broken forever, even after the deploy finished and the file was reachable
// again. This is what made updates look like they "broke" the app.
function cachePut(request, response) {
  if (response.ok) {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(request, copy));
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const request = event.request;
  const isNavigation = request.mode === "navigate";
  const isAppAsset = /\.(?:js|css|html)$/.test(new URL(request.url).pathname);

  if (isNavigation || isAppAsset) {
    event.respondWith(
      fetch(request)
        .then((response) => cachePut(request, response))
        .catch(() => caches.match(request).then((cached) => cached || caches.match(scopePath())))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => cachePut(request, response)))
  );
});
