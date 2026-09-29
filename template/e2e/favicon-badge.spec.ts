import { test, expect } from "@playwright/test";
import { loginAdminUi } from "./login-admin";

// Фавикон с живой индикацией: новая бронь → бейдж со счётом необработанных;
// открытие колокольчика бейдж НЕ гасит — только обработка брони/заказа.
test("фавикон показывает необработанные заказы и брони", async ({ page, request }) => {
  test.setTimeout(150_000);
  await page.goto("/admin/login");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);
  const originalTitle = await page.title();

  // Бронь через публичный API
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

  // Бейдж появляется (поллинг раз в 10 с, мигает — опрашиваем)
  await expect
    .poll(async () => page.evaluate(() => document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.href ?? ""), {
      timeout: 30_000,
      intervals: [1000, 2000, 4000],
    })
    .toContain("data:image/png");
  await expect
    .poll(async () => page.title(), { timeout: 15_000, intervals: [700, 1200] })
    .toMatch(new RegExp(`^\\(\\d+\\) ${originalTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));

  // Открытие колокольчика бейдж НЕ снимает
  await page.getByRole("button", { name: /Оповещения/ }).first().click();
  await page.waitForTimeout(1500);
  const hrefAfterPeek = await page.evaluate(() => document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.href ?? "");
  expect(hrefAfterPeek).toContain("data:image/png");

  // Обработка брони (подтверждение в админке) — бейдж гаснет
  await page.goto("/admin/bookings");
  const bookingRow = page.locator("button", { hasText: "2026-12-05" }).first();
  await bookingRow.click();
  await page.getByRole("button", { name: "Подтвердить бронь" }).click();
  await expect
    .poll(async () => page.evaluate(() => document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.href ?? ""), {
      timeout: 25_000,
      intervals: [1000, 2000, 4000],
    })
    .not.toContain("data:image/png");
});

// Событие доезжает до КАЖДОЙ открытой вкладки админки (звук/бейдж работают везде).
test("две вкладки админки получают событие одновременно", async ({ page, context, request }) => {
  test.setTimeout(150_000);
  await page.goto("/admin/login");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);
  const pageB = await context.newPage();
  await pageB.goto("/admin");
  await pageB.waitForLoadState("networkidle");

  const slots = await (await request.get("/api/booking/slots?date=2026-12-06")).json();
  const times = (slots.slots ?? []).map((s: { time?: string }) => s.time ?? s);
  const booking = await request.post("/api/booking", {
    data: {
      date: "2026-12-06",
      time: times[times.length - 1],
      guests: 3,
      customerName: "E2E Две вкладки",
      customerPhone: "+79000000078",
      comment: "tabs",
    },
  });
  expect(booking.ok()).toBe(true);

  // Обе вкладки видят событие в панели (поллинг ~10 с + запас)
  for (const tab of [page, pageB]) {
    await tab.getByRole("button", { name: /Оповещения/ }).first().click();
    await expect(tab.getByText("2026-12-06 в", { exact: false }).first()).toBeVisible({ timeout: 30_000 });
  }
  await context.close();
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
