/* Service worker админского приложения (scope /admin/).
   Только push и клики по уведомлениям: авторизованный HTML и API НЕ кэшируем —
   админка всегда свежая, при потере сети работает штатная офлайн-плашка сайта. */
self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

var REFERENCE_RE = /^[A-Za-z0-9_-]{1,100}$/;

/* Страницы админского приложения: /admin и всё под /admin/. Scope регистрации
   (/admin/) НЕ покрывает URL без слэша — сравниваем по pathname. */
function inAdminApp(url) {
  try {
    var pathname = new URL(url).pathname;
    return pathname === "/admin" || pathname.indexOf("/admin/") === 0;
  } catch {
    return false;
  }
}

/* Цель строим из ПРОВЕРЕННОЙ пары kind+reference (обе пришли от нашего сервера).
   Произвольный URL из payload не принимаем. */
function targetFromPayload(data) {
  if (data.kind === "order" && REFERENCE_RE.test(data.reference)) return "/admin?selected=" + data.reference;
  if (data.kind === "booking" && REFERENCE_RE.test(data.reference)) return "/admin/bookings?selected=" + data.reference;
  return "/admin";
}

self.addEventListener("push", function (event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  var kind = data.kind === "booking" ? "booking" : data.kind === "test" ? "test" : "order";
  var title = data.label || (kind === "booking" ? "Новая бронь" : kind === "test" ? "Проверка уведомлений" : "Новый заказ");
  event.waitUntil(
    self.registration.showNotification(title, {
      body: kind === "test" ? "Если вы видите это уведомление, доставка работает" : "Нажмите, чтобы открыть в админке",
      tag: String(data.eventId || Date.now()),
      data: { target: targetFromPayload(data) },
      icon: "/api/site-icon?size=192",
      badge: "/api/site-icon?size=192",
    })
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var target = "/admin";
  try {
    if (event.notification.data && event.notification.data.target) target = event.notification.data.target;
  } catch {
    target = "/admin";
  }
  event.waitUntil(
    (async function () {
      var windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (var i = 0; i < windows.length; i++) {
        var client = windows[i];
        if (inAdminApp(client.url) && "focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(target);
            } catch {
              /* навигация не обязана успеть — окно уже сфокусировано */
            }
          }
          return;
        }
      }
      await self.clients.openWindow(target);
    })()
  );
});
