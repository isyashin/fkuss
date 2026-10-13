/* Service worker витрины (scope /, issue #52).
   Документы и GET API витрины — network-first (онлайн всегда свежий ответ,
   офлайн — последний сохранённый); хешированная статика —
   stale-while-revalidate; документ без сети и без кэша — заглушка
   /offline.html. POST/заказы/оплата/админка — только сеть, кэш запрещён.
   Правила выбора стратегии — в sw-strategy.js (юнит-тесты: tests/shop-sw.test.ts). */
importScripts("/sw-strategy.js");

var STRATEGY = self.ShopSwStrategy;
var SELF_ORIGIN = self.location.origin;

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(STRATEGY.PAGE_CACHE).then(function (cache) {
      return cache.addAll(STRATEGY.PRECACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    (async function () {
      var keys = await caches.keys();
      await Promise.all(
        keys.map(function (key) {
          return STRATEGY.ALL_CACHES.indexOf(key) === -1 ? caches.delete(key) : undefined;
        })
      );
      await self.clients.claim();
    })()
  );
});

/* Успешный same-origin ответ кладём в кэш; кэш страниц/данных ограничен. */
async function fetchAndCache(request, cacheName) {
  var response = await fetch(request);
  if (response.ok && response.type === "basic") {
    var cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
    if (cacheName === STRATEGY.PAGE_CACHE) await trimCache(cache);
  }
  return response;
}

async function trimCache(cache) {
  var keys = await cache.keys();
  for (var i = 0; i < keys.length - STRATEGY.MAX_PAGE_ENTRIES; i += 1) {
    await cache.delete(keys[i]);
  }
}

/* Stale-while-revalidate: кэш сразу, фоном — обновление из сети. */
async function swrResponse(request) {
  var cacheName = request.mode === "navigate" ? STRATEGY.PAGE_CACHE : STRATEGY.STATIC_CACHE;
  var cached = await caches.match(request);
  var network = fetchAndCache(request, cacheName).catch(function () {
    return null;
  });
  if (cached) return cached;
  var response = await network;
  return response || offlineFallback(request);
}

/* Network-first: свежесть важнее скорости; офлайн — последний кэш,
   для документа без кэша — заглушка /offline.html. */
async function networkFirstResponse(request) {
  try {
    return await fetchAndCache(request, STRATEGY.PAGE_CACHE);
  } catch {
    var cached = await caches.match(request);
    return cached || offlineFallback(request);
  }
}

async function offlineFallback(request) {
  if (request.mode !== "navigate") return Response.error();
  var fallback = await caches.match(STRATEGY.OFFLINE_URL);
  return fallback || Response.error();
}

self.addEventListener("fetch", function (event) {
  var strategy = STRATEGY.decideStrategy(event.request, SELF_ORIGIN);
  if (strategy === "swr") event.respondWith(swrResponse(event.request));
  else if (strategy === "network-first") event.respondWith(networkFirstResponse(event.request));
  /* network-only и pass-through — поведение браузера по умолчанию (только сеть) */
});
