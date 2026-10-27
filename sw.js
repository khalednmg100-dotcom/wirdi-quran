const CACHE_NAME = "wirdi-cache-v15";
const QCF_CACHE = "wirdi-qcf";   // mushaf page fonts: kept across app updates, so pages read once work offline
const APP_SHELL = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png", "./badge-96.png", "./fonts/UthmanicHafs.woff2"];

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
        keys.filter(function(key) { return key !== CACHE_NAME && key.indexOf("wirdi-audio") !== 0 && key.indexOf("wirdi-tafsir") !== 0 && key !== "wirdi-meta" && key !== QCF_CACHE; }).map(function(key) { return caches.delete(key); })
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
// Dua reminder for Amira Hamed Abdel-Fattah (alive): twice a day (10:00, 21:00); the other hours 8:00–23:00
// a dhikr / salah upon the Prophet ﷺ (same lists as the page, at most once an hour).
var DUA_AMIRA = [
  "اللهم احفظها بحفظك، وبارك في عمرها وصحتها، وألبسها ثوب العافية",
  "اللهم اشفها وعافها، واجعل القرآن ربيع قلبها ونور صدرها",
  "اللهم ارزقها السعادة في الدنيا والآخرة، وتقبّل منها صالح الأعمال",
  "اللهم اغفر لها وارحمها، وأطل عمرها في طاعتك، وأحسن خاتمتها",
  "اللهم اجعل هذا التطبيق في ميزان حسناتها، وأجرًا لا ينقطع لها",
  "اللهم أسعد قلبها، واقضِ حوائجها، واكفها ما أهمّها",
  "اللهم ارزقها الفردوس الأعلى من الجنة بغير حساب ولا سابقة عذاب",
  "اللهم بارك لها في رزقها وأهلها، واجعلها من أهل القرآن"
];
var DHIKR = [
  ["صلِّ على محمد ﷺ", "اللهم صلِّ وسلم على نبينا محمد — «من صلى عليَّ واحدة صلى الله عليه عشرًا» (مسلم ٤٠٨)"],
  ["سبحان الله وبحمده", "«من قال سبحان الله وبحمده في يوم مائة مرة حُطّت خطاياه وإن كانت مثل زبد البحر» (البخاري ٦٤٠٥)"],
  ["صلِّ على محمد ﷺ", "اللهم صلِّ وسلم وبارك على نبينا محمد"],
  ["كلمتان حبيبتان إلى الرحمن", "سبحان الله وبحمده، سبحان الله العظيم (البخاري ٦٦٨٢)"],
  ["لا حول ولا قوة إلا بالله", "«فإنها كنز من كنوز الجنة» (البخاري ٦٣٨٤)"],
  ["الاستغفار", "أستغفر الله وأتوب إليه (البخاري ٦٣٠٧)"]
];
function duaCheck(c, m) {
  var now = Date.now(), h = new Date().getHours(), hour = Math.floor(now / 3600000);
  if (h < 8 || h >= 23 || Math.floor((m.duaAt || 0) / 3600000) === hour) return Promise.resolve();
  var dua = (h === 10 || h === 21) && m.duaOn !== false, dhikr = !dua && m.dhikrOn !== false;
  if (!dua && !dhikr) return Promise.resolve();
  m.duaAt = now;
  return c.put("meta.json", new Response(JSON.stringify(m), { headers: { "Content-Type": "application/json" } })).then(function() {
    if (dua) return self.registration.showNotification("🤍 لا تنسَ الدعاء لأميرة حامد عبد الفتاح", { body: DUA_AMIRA[hour % DUA_AMIRA.length], icon: "icon-192.png", badge: "badge-96.png", tag: "dua-amira", lang: "ar", dir: "rtl", data: { url: "./" } });
    var d = DHIKR[hour % DHIKR.length];
    return self.registration.showNotification("📿 " + d[0], { body: d[1], icon: "icon-192.png", badge: "badge-96.png", tag: "dhikr-hourly", lang: "ar", dir: "rtl", data: { url: "./" } });
  });
}
function dailyCheck() {
  return caches.open("wirdi-meta").then(function(c) {
    return c.match("meta.json").then(function(r) { return r ? r.json() : null; }).then(function(m) {
      if (!m || !m.enabled) return;
      return duaCheck(c, m).then(function() { return streakCheck(c, m); });
    });
  }).catch(function() {});
}
function streakCheck(c, m) {
    return Promise.resolve().then(function() {
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
        return self.registration.showNotification(title, { body: body, icon: "icon-192.png", badge: "badge-96.png", tag: "wirdi-daily", lang: "ar", dir: "rtl", data: { url: "./" } });
      });
    });
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
  var reqUrl = new URL(event.request.url), reqHost = reqUrl.hostname;
  if (reqUrl.pathname.slice(-12) === "/donate.json") return;
  if (reqHost === "verses.quran.com" && reqUrl.pathname.indexOf("/fonts/quran/") === 0) {
    event.respondWith(caches.open(QCF_CACHE).then(function(c) {
      return c.match(event.request).then(function(hit) {
        return hit || fetch(event.request).then(function(r) { if (r.ok) c.put(event.request, r.clone()); return r; });
      });
    }));
    return;
  }   // always fresh from the network (the owner edits it)
  if (reqHost === "everyayah.com" || reqHost === "api.quran.com" || reqHost === "verses.quran.com" || /quranicaudio.com$/.test(reqHost) || /mp3quran.net$/.test(reqHost) || /(^|\.)archive\.org$/.test(reqHost) || reqHost === "media.way2quran.com" || reqHost === "suwaidan.com" || reqHost === "audio.islamweb.net") return;
  // our own audio (adhkar, adhan, salawat): the player asks for byte ranges (206), which can't be cached →
  // fetch the whole file once, keep it, and answer every later request (offline too) from that copy
  if (reqUrl.origin === self.location.origin && reqUrl.pathname.indexOf("/audio/") !== -1) {
    event.respondWith(caches.open(CACHE_NAME).then(function(c) {
      return c.match(reqUrl.href).then(function(hit) {
        return hit || fetch(reqUrl.href).then(function(r) { if (r.ok && r.status === 200) c.put(reqUrl.href, r.clone()); return r; });
      });
    }));
    return;
  }
  // ayah timings of our own reciters: fresh when online (they get improved), the cached copy offline
  if (reqUrl.origin === self.location.origin && reqUrl.pathname.indexOf("/timings/") !== -1) {
    event.respondWith(fetch(event.request, { cache: "no-store" }).then(function(r) {
      if (r.ok) { var copy = r.clone(); caches.open(CACHE_NAME).then(function(c) { c.put(event.request, copy); }); }
      return r;
    }).catch(function() { return caches.match(event.request); }));
    return;
  }

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
