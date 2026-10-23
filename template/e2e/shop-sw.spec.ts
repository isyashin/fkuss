import { test, expect } from "@playwright/test";

// Service worker витрины (#52): отдаётся как javascript; после посещения
// страница доступна офлайн из кэша (последние данные), без кэша — заглушка.

test("SW-01: /sw.js отдаётся со стратегиями кэша витрины", async ({ request }) => {
  const response = await request.get("/sw.js");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain("javascript");
  const body = await response.text();
  // в отличие от админского SW, витринный обрабатывает fetch
  expect(body).toContain('addEventListener("fetch"');
  expect(body).toContain("/offline.html");
});

test("SW-02: повторный визит офлайн — последние данные из кэша", async ({ page, context, browserName }) => {
  // SW+offline нестабилен в Playwright WebKit: page.reload() падает с
  // «WebKit encountered an internal error» (CI, webkit-mobile, PR #70).
  // Офлайн-поведение покрыто на mobile-360 и desktop; в реальном Safari
  // SW с network-first документами работает штатно.
  test.skip(browserName === "webkit", "WebKit Playwright: нестабилен SW+offline");
  await page.goto("/#menu");
  await page.waitForFunction(() =>
    navigator.serviceWorker.getRegistration().then((registration) => Boolean(registration?.active)),
  );
  // active can still be activating; wait for actual control before warming.
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  // под контролем SW: документ и статика текущего визита попадают в кэш
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Хинкали" })).toBeVisible({ timeout: 15000 });
  await context.setOffline(false);
});

test("SW-03: delivery availability cannot fall back to a cached future preorder offline", async ({ page, context }) => {
  try {
    await page.goto("/#menu");
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    const online = await page.evaluate(async () => {
      const response = await fetch("/api/delivery/slots");
      return { status: response.status, cacheControl: response.headers.get("cache-control") };
    });
    expect(online.status).toBe(200);
    expect(online.cacheControl).toContain("no-store");
    const entries = await page.evaluate(async () => {
      const all = await Promise.all((await caches.keys()).map(async name => (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname)));
      return all.flat();
    });
    expect(entries).not.toContain("/api/delivery/slots");
    // Even a previously poisoned cache cannot replace the failed network check.
    await page.evaluate(async () => {
      await (await caches.open("qa-stale-delivery")).put("/api/delivery/slots", new Response(JSON.stringify({asapAvailable:true,preOrder:{enabled:true,slots:[{date:"2099-01-01",time:"12:00"}]}}), {headers:{"Content-Type":"application/json"}}));
    });
    await context.setOffline(true);
    expect(await page.evaluate(async () => { try { await fetch("/api/delivery/slots"); return true; } catch { return false; } })).toBe(false);
  } finally { await context.setOffline(false); }
});
