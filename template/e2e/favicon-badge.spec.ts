import { test, expect } from "@playwright/test";
import { loginAdminUi } from "./login-admin";

// Фавикон с живой индикацией: новая бронь → бейдж со счётом необработанных;
// открытие колокольчика бейдж НЕ гасит — только обработка брони/заказа.
// Счётчик считаем относительно начального состояния (БД общая с другими спеками).
test("фавикон показывает необработанные заказы и брони", async ({ page, request }) => {
  test.setTimeout(150_000);
  await page.goto("/admin/login");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);

  const badgeCount = async () => {
    const match = (await page.title()).match(/^\((\d+)\)/);
    return match ? Number(match[1]) : 0;
  };
  const iconHref = () => page.evaluate(() => document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.href ?? "");
  // Даём опросу применить текущее состояние (бэклог общей БД), затем фиксируем базу
  await page.waitForTimeout(12_000);
  const n0 = await badgeCount();

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

  // Счёт вырос на 1, фавикон — с бейджем (поллинг раз в 10 с, мигает — опрашиваем)
  await expect.poll(async () => (await iconHref()).startsWith("data:image/png"), { timeout: 30_000, intervals: [1000, 2000, 4000] }).toBe(true);
  await expect.poll(async () => await badgeCount(), { timeout: 30_000, intervals: [800, 1500] }).toBe(n0 + 1);

  // Открытие колокольчика бейдж НЕ снимает
  await page.getByRole("button", { name: /Оповещения/ }).first().click();
  await expect.poll(async () => (await iconHref()).startsWith("data:image/png"), { timeout: 10_000, intervals: [700, 1200] }).toBe(true);

  // Обработка брони: быстрое подтверждение в виджете «Ближайшие брони» на дашборде; счёт возвращается к n0
  await page.goto("/admin");
  const card = page.locator("div", { has: page.getByRole("link", { name: /Открыть бронь 2026-12-05/ }) }).last();
  await expect(card.getByRole("button", { name: "Подтвердить" })).toBeVisible({ timeout: 20000 });
  await card.getByRole("button", { name: "Подтвердить" }).click();
  await expect.poll(async () => await badgeCount(), { timeout: 30_000, intervals: [1000, 2000, 4000] }).toBe(n0);
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

  // Обе вкладки видят событие в панели (поллинг ~10 с + запас).
  // Под нагрузкой CI гидратация мобильной оболочки отстаёт — кликаем по колокольчику
  // до фактического открытия панели, затем ждём текст события.
  for (const tab of [page, pageB]) {
    const bell = tab.getByRole("button", { name: /Оповещения/ }).first();
    await expect(bell).toBeVisible();
    await expect.poll(async () => {
      await bell.click().catch(() => false);
      return tab.getByRole("region", { name: "Новые события" }).isVisible().catch(() => false);
    }, { timeout: 30_000, intervals: [900, 1600] }).toBe(true);
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

// Повторы сигнала: настройка в карточке звука сохраняется и отдаётся опросу.
test("повторы сигнала настраиваются и отдаются в опросе уведомлений", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/admin/login");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/settings?section=sound");
  const repeats = page.getByLabel("Повторы сигнала");
  await expect(repeats).toBeVisible();

  await repeats.fill("3");
  await expect.poll(async () => (await page.request.get("/api/admin/events")).json().then((d) => d.sound.repeats), {
    timeout: 15_000,
    intervals: [800, 1500],
  }).toBe(3);

  await page.reload();
  await expect(page.getByLabel("Повторы сигнала")).toHaveValue("3", { timeout: 15000 });

  // возвращаем дефолт
  await page.getByLabel("Повторы сигнала").fill("10");
  await expect.poll(async () => (await page.request.get("/api/admin/events")).json().then((d) => d.sound.repeats), {
    timeout: 15_000,
    intervals: [800, 1500],
  }).toBe(10);
});
