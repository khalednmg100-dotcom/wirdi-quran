const CACHE_NAME = "wirdi-cache-v4";
const APP_SHELL = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; }).map(function(key) { return caches.delete(key); })
      );
    })
  );
  self.clients.claim();
});

// The HTML document changes often as the app is updated, so it must always be
// fetched fresh when online (network-first) — falling back to the cached copy
// only when offline. Other assets (icons, manifest, fonts) rarely change, so a
// cache-first strategy for those avoids unnecessary refetching.
self.addEventListener("fetch", function(event) {
  if (event.request.method !== "GET") return;

  var isDocument = event.request.mode === "navigate" || event.request.destination === "document";

  if (isDocument) {
    // "reload" forces bypassing the browser's own HTTP cache too, not just
    // this service worker's cache — otherwise a fresh deploy can still be
    // masked by ordinary HTTP caching for the page's normal max-age window.
    event.respondWith(
      fetch(event.request, { cache: "reload" })
        .then(function(response) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, copy); });
          return response;
        })
        .catch(function() {
          return caches.match(event.request).then(function(cached) {
            return cached || caches.match("./index.html");
          });
        })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(function(cached) {
      return (
        cached ||
        fetch(event.request)
          .then(function(response) {
            var copy = response.clone();
            caches.open(CACHE_NAME).then(function(cache) { cache.put(event.request, copy); });
            return response;
          })
          .catch(function() { return cached; })
      );
    })
  );
});
