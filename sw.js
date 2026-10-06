const CACHE_NAME = "wirdi-cache-v7";
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
        keys.filter(function(key) { return key !== CACHE_NAME && key.indexOf("wirdi-audio") !== 0 && key.indexOf("wirdi-tafsir") !== 0 && key !== "wirdi-meta"; }).map(function(key) { return caches.delete(key); })
      );
    })
  );
  self.clients.claim();
});

// ---- Daily streak reminder (Periodic Background Sync, Chrome on Android) ----
// The page keeps {lastVisit, streak, enabled, hour} in the "wirdi-meta" cache. When Chrome wakes us
// up and the user hasn't opened the app today (after `hour`), show ONE gentle reminder for the day.
function arDigits(n) { return String(n).replace(/\d/g, function(d) { return "٠١٢٣٤٥٦٧٨٩"[d]; }); }
function dayKey(d) { return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
function dailyCheck() {
  return caches.open("wirdi-meta").then(function(c) {
    return c.match("meta.json").then(function(r) { return r ? r.json() : null; }).then(function(m) {
      if (!m || !m.enabled) return;
      var now = new Date(), today = dayKey(now), y = new Date(now); y.setDate(y.getDate() - 1);
      if (m.lastVisit === today || m.notified === today || now.getHours() < (m.hour || 17) || now.getHours() >= 23) return;
      var alive = m.lastVisit === dayKey(y) && m.streak > 0, title, body;
      if (alive && now.getDate() % 2) {
        title = "🔥 سلسلتك " + arDigits(m.streak) + " يوم مستنياك";
        body = "دقيقة مع وِرْدِي النهارده تكمّلها بإذن الله 🤍";
      } else if (alive) {
        title = "📖 لا تنسَ وردك اليوم";
        body = "سُئل النبي ﷺ: أيّ الأعمال أحبّ إلى الله؟ قال: «أَدْوَمُهَا وَإِنْ قَلَّ» (البخاري ٦٤٦٥) — حافظ على سلسلتك 🔥 " + arDigits(m.streak);
      } else {
        title = "🤍 وحشتنا";
        body = "افتح وِرْدِي واقرأ ولو آية — ونبدأ سلسلة جديدة سوا";
      }
      m.notified = today;
      return c.put("meta.json", new Response(JSON.stringify(m), { headers: { "Content-Type": "application/json" } })).then(function() {
        return self.registration.showNotification(title, { body: body, icon: "icon-192.png", badge: "icon-192.png", tag: "wirdi-daily", lang: "ar", dir: "rtl", data: { url: "./" } });
      });
    });
  }).catch(function() {});
}
self.addEventListener("periodicsync", function(event) {
  if (event.tag === "wirdi-daily") event.waitUntil(dailyCheck());
});
self.addEventListener("notificationclick", function(event) {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function(list) {
    for (var i = 0; i < list.length; i++) { if ("focus" in list[i]) return list[i].focus(); }
    return self.clients.openWindow((event.notification.data && event.notification.data.url) || "./");
  }));
});

// The HTML document changes often as the app is updated, so it must always be
// fetched fresh when online (network-first) — falling back to the cached copy
// only when offline. Other assets (icons, manifest, fonts) rarely change, so a
// cache-first strategy for those avoids unnecessary refetching.
self.addEventListener("fetch", function(event) {
  if (event.request.method !== "GET") return;
  var reqHost = new URL(event.request.url).hostname;
  if (reqHost === "everyayah.com" || reqHost === "api.quran.com" || reqHost === "verses.quran.com" || /quranicaudio.com$/.test(reqHost) || /mp3quran.net$/.test(reqHost)) return;

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
