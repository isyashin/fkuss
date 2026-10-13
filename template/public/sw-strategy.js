/* Логика кэш-стратегии service worker витрины (issue #52).
   Общий файл: /sw.js подключает его через importScripts,
   юнит-тесты — tests/shop-sw.test.ts. */
(function (root) {
  "use strict";

  /* Версия кэша: бамп при правке стратегий/прекэша — на activate
     старые кэши удаляются. v2: документы перешли с swr на network-first. */
  var VERSION = "v2";
  var STATIC_CACHE = "fkuss-shop-static-" + VERSION;
  var PAGE_CACHE = "fkuss-shop-pages-" + VERSION;

  var OFFLINE_URL = "/offline.html";
  var PRECACHE = [OFFLINE_URL];

  /* Потолок записей кэша страниц/данных (мобильные устройства). */
  var MAX_PAGE_ENTRIES = 50;

  /* Никогда не кэшируем: админку и весь чувствительный API. Заказ/бронь/
     оплата/вход без сети должны штатно падать, а не «успевать» из кэша. */
  var NETWORK_ONLY_PREFIXES = [
    "/admin",
    "/api/admin",
    "/api/order",
    "/api/booking",
    "/api/auth",
    "/api/payments",
    "/api/pv",
    "/api/sites",
    "/api/jobs",
  ];

  /* GET API витрины: слоты доставки/брони, зона. Проверяем ДО network-only:
     /api/booking/slots начинается с /api/booking. Онлайн — всегда свежий
     ответ, офлайн — последний сохранённый. */
  var NETWORK_FIRST_PREFIXES = ["/api/booking/slots", "/api/delivery"];

  /* Статика: хешированные чанки, оптимизированные изображения, ассеты
     контента (иконки, фото блюд), иконки сайта, аудио. */
  var STATIC_PREFIXES = ["/_next/static", "/_next/image", "/content-asset", "/api/site-icon", "/audio/"];

  function startsWithAny(pathname, prefixes) {
    for (var i = 0; i < prefixes.length; i += 1) {
      if (pathname.indexOf(prefixes[i]) === 0) return true;
    }
    return false;
  }

  /**
   * Стратегия обработки запроса витрины:
   *  "pass-through"  — чужой origin / не http(s) — SW не вмешивается;
   *  "network-only"  — только сеть, кэш запрещён (POST, заказы, админка);
   *  "network-first" — свежий ответ онлайн, офлайн — последний кэш
   *                    (GET API витрины И документы: HTML не отдаём
   *                    устаревшим, иначе витрина «замораживается» после
   *                    правок в админке до протухания кэша);
   *  "swr"           — кэш сразу + фоновое обновление (только хешированная
   *                    статика: чанки, шрифты, оптимизированные фото).
   */
  function decideStrategy(input, origin) {
    var url;
    try {
      url = new URL(input.url);
    } catch {
      return "pass-through";
    }
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.origin !== origin) {
      return "pass-through";
    }
    if (input.method !== "GET") return "network-only";
    var pathname = url.pathname;
    if (startsWithAny(pathname, NETWORK_FIRST_PREFIXES)) return "network-first";
    if (startsWithAny(pathname, NETWORK_ONLY_PREFIXES)) return "network-only";
    if (input.mode === "navigate") return "network-first";
    if (startsWithAny(pathname, STATIC_PREFIXES)) return "swr";
    return "pass-through";
  }

  var api = {
    VERSION: VERSION,
    STATIC_CACHE: STATIC_CACHE,
    PAGE_CACHE: PAGE_CACHE,
    ALL_CACHES: [STATIC_CACHE, PAGE_CACHE],
    OFFLINE_URL: OFFLINE_URL,
    PRECACHE: PRECACHE,
    MAX_PAGE_ENTRIES: MAX_PAGE_ENTRIES,
    decideStrategy: decideStrategy,
  };

  root.ShopSwStrategy = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
