import { test, expect } from "@playwright/test";
import { loginAdminUi } from "./login-admin";

// Фавикон с живой индикацией: новая бронь → бейдж со счётом и префикс "(N)" в заголовке;
// после открытия панели уведомлений бейдж снимается.
test("фавикон показывает новые заказы и брони", async ({ page, request }) => {
  test.setTimeout(120_000);
  await page.goto("/admin/login");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);
  const originalTitle = await page.title();

  // Бронь через публичный API (та же сессия гарантирует, что событие увидит поллинг)
  const slots = await (await request.get("/api/booking/slots?date=2026-12-05")).json();
  const times = (slots.slots ?? []).map((s: { time?: string }) => s.time ?? s);
  const booking = await request.post("/api/booking", {
    data: {
      date: "2026-12-05",
      time: times[0],
      guests: 2,
      customerName: "E2E Фавикон",
      customerPhone: "+79000000077",
      comment: "badge",
    },
  });
  expect(booking.ok()).toBe(true);

  // Поллинг уведомлений раз в 10 с: ждём появления бейджа (мигает — опрашиваем)
  await expect
    .poll(async () => page.evaluate(() => document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.href ?? ""), {
      timeout: 30_000,
      intervals: [1000, 2000, 4000],
    })
    .toContain("data:image/png");
  await expect
    .poll(async () => page.title(), { timeout: 15_000, intervals: [700, 1200] })
    .toMatch(new RegExp(`^\\(\\d+\\) ${originalTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));

  // Открыли панель уведомлений — непрочитанные сброшены, бейдж снят
  await page.getByRole("button", { name: /Оповещения/ }).first().click();
  await expect
    .poll(async () => page.evaluate(() => document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.href ?? ""), {
      timeout: 15_000,
      intervals: [800, 1500],
    })
    .not.toContain("data:image/png");
  await expect(page).toHaveTitle(new RegExp(`^${originalTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
});

// Витрина и кабинет гостя отдают динамический фавикон сайта (без бейджа).
test("витрина и кабинет гостя отдают фавикон сайта", async ({ page }) => {
  for (const path of ["/", "/account"]) {
    await page.goto(path);
    const icon = page.locator('link[rel="icon"]').first();
    await expect(icon).toHaveAttribute("href", /\/api\/site-icon\?size=32/);
  }
  const response = await page.request.get("/api/site-icon?size=32");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("image/png");
});
