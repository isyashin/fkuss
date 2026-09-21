import { test, expect } from "@playwright/test";

// Полный путь доставки: админ создаёт scheduled-вариант через UI, гость заказывает
function ip(project: string, n: number) {
  const projectOctet = project === "mobile-360" ? 1 : project === "webkit-mobile" ? 2 : 3;
  return { "x-forwarded-for": `10.99.8.${projectOctet}${n}` };
}

test("админ создаёт scheduled-вариант, гость заказывает с интервалом", async ({ page, request }, testInfo) => {
  const optName = `Курьер по времени ${Date.now().toString(36)}`;
  const asapName = `Экспресс 24/7 ${Date.now().toString(36)}`;

  // 1. Админка → Доставка → новый вариант
  await page.goto("/admin/login");
  await page.getByPlaceholder("Пароль").fill("admin");
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL(/\/admin$/);

  await page.goto("/admin/delivery");
  await page.getByRole("button", { name: "+ Вариант доставки" }).click();
  await page.getByLabel("Название").fill(optName);
  await page.getByLabel("Цена, ₽").fill("250");
  await page.getByLabel("Бесплатно от, ₽").fill("1000");
  await page.getByLabel("Часы с").fill("00:00");
  await page.getByLabel("Часы до").fill("23:59");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText(optName)).toBeVisible({ timeout: 15000 });

  // ASAP-вариант 24/7 для детерминированного DEL-01 (ресторан открыт не всегда)
  await page.getByRole("button", { name: "+ Вариант доставки" }).click();
  await page.getByLabel("Название").fill(asapName);
  await page.getByLabel("Режим").selectOption("asap");
  await page.getByLabel("Часы с").fill("00:00");
  await page.getByLabel("Часы до").fill("23:59");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText(asapName)).toBeVisible({ timeout: 15000 });

  // 2. API отдаёт вариант с окнами
  const slots = await (await request.get("/api/delivery/slots")).json();
  const scheduled = slots.options.find((o: { name: string }) => o.name === optName);
  expect(scheduled).toBeTruthy();
  expect(scheduled.windows.length).toBeGreaterThan(0);

  // 3. Заказ с последним доступным окном — принят, цена доставки 250
  const window = scheduled.windows[scheduled.windows.length - 1];
  const response = await request.post("/api/order", {
    data: {
      items: [{ dishId: "khachapuri-adjarski", quantity: 2, modifierIds: [] }], // 980 ₽ ≥ минималки 800
      type: "delivery",
      zoneName: null,
      address: "ул. Тестовая, 1",
      customerName: "Тест доставки",
      customerPhone: "+79990000004",
      website: "",
      deliveryMode: "scheduled",
      deliveryDate: window.date,
      deliverySlotStart: window.start,
      deliverySlotEnd: window.end,
      deliveryOptionId: scheduled.id,
    },
    headers: ip(testInfo.project.name, 1),
  });
  expect(response.ok()).toBe(true);
  const data = await response.json();
  expect(data.deliveryPrice).toBe(250);
  expect(data.total).toBe(1230);

  // 4. DEL-04: прошедший интервал отклоняется
  const stale = await request.post("/api/order", {
    data: {
      items: [{ dishId: "khachapuri-adjarski", quantity: 2, modifierIds: [] }],
      type: "delivery",
      zoneName: null,
      address: "ул. Тестовая, 1",
      customerName: "Тест доставки",
      customerPhone: "+79990000004",
      website: "",
      deliveryMode: "scheduled",
      deliveryDate: "2020-01-01",
      deliverySlotStart: "10:00",
      deliverySlotEnd: "11:00",
      deliveryOptionId: scheduled.id,
    },
    headers: ip(testInfo.project.name, 2),
  });
  expect(stale.status()).toBe(400);

  // 5. DEL-07: сумма выше порога — доставка бесплатная
  const free = await request.post("/api/order", {
    data: {
      items: [{ dishId: "khachapuri-adjarski", quantity: 3, modifierIds: [] }], // 1470 > 1000
      type: "delivery",
      zoneName: null,
      address: "ул. Тестовая, 1",
      customerName: "Тест доставки",
      customerPhone: "+79990000004",
      website: "",
      deliveryMode: "scheduled",
      deliveryDate: window.date,
      deliverySlotStart: window.start,
      deliverySlotEnd: window.end,
      deliveryOptionId: scheduled.id,
    },
    headers: ip(testInfo.project.name, 3),
  });
  expect(free.ok()).toBe(true);
  expect((await free.json()).deliveryPrice).toBe(0);
});

test("DEL-01: asap — заказ «как можно скорее» без интервала", async ({ request }, testInfo) => {
  // Берём ASAP-вариант 24/7, созданный в первом тесте файла
  const slots = await (await request.get("/api/delivery/slots")).json();
  const asap = slots.options.find((o: { name: string; mode: string }) => o.mode === "asap" && o.name.startsWith("Экспресс 24/7"));
  expect(asap).toBeTruthy();

  const response = await request.post("/api/order", {
    data: {
      items: [{ dishId: "khachapuri-adjarski", quantity: 2, modifierIds: [] }],
      type: "delivery",
      zoneName: null,
      address: "ул. Тестовая, 1",
      customerName: "Тест доставки",
      customerPhone: "+79990000004",
      website: "",
      deliveryMode: "asap",
      deliveryOptionId: asap.id,
    },
    headers: ip(testInfo.project.name, 4),
  });
  expect(response.ok()).toBe(true);
});
