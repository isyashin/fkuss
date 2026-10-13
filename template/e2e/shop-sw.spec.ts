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
  // под контролем SW: документ и статика текущего визита попадают в кэш
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Хинкали" })).toBeVisible({ timeout: 15000 });
  await context.setOffline(false);
});
