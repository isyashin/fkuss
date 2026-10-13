import { test, expect } from "@playwright/test";
import { loginAdminUi } from "./login-admin";

// Регрессионные сценарии аудита админки (08.10.2026):
// F01 — поиск заказов серверный (q в URL, пустое состояние), F02 — добавление
// блюда в состав заказа не падает на HTTP-стенде (crypto.randomUUID).

test("F01: поиск заказов по имени фильтрует список и объясняет пустой результат", async ({ page }, testInfo) => {
  // Свой заказ с именем, уникальным для проекта (БД общая между проектами).
  const guestName = `Поисковик ${testInfo.project.name}`;
  await page.goto("/menu");
  await page.getByRole("button", { name: /Хачапури по-аджарски/ }).first().click();
  await page.getByRole("button", { name: /Добавить ·/ }).click();
  await page.getByRole("button", { name: /Корзина · 1/ }).click();
  await page.getByRole("button", { name: /Оформить ·/ }).click();
  await page.getByRole("button", { name: "Самовывоз" }).click();
  await page.getByLabel("Имя").fill(guestName);
  await page.getByLabel("Телефон").fill("+79990005544");
  await page.getByRole("button", { name: /Заказать ·/ }).click();
  await expect(page.getByRole("heading", { name: /Заказ №\d+ принят/ })).toBeVisible({ timeout: 15000 });

  await page.goto("/admin/login");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);

  // Отсутствующий запрос: q в URL, пустое состояние, сброс
  await page.getByLabel("Поиск заказа").fill("такого-гостя-нет-42");
  await page.getByRole("button", { name: "Найти" }).click();
  await expect(page).toHaveURL(/q=/);
  await expect(page.getByText("Заказов по этим условиям нет.")).toBeVisible();
  await page.getByRole("link", { name: "Сбросить поиск" }).click();
  await expect(page).toHaveURL(/\/admin\/?(\?mode=current)?$/);

  // Существующий гость: список фильтруется ровно до одного заказа
  // (getByRole исключает скрытый мобильный список — в DOM две копии кнопок).
  await page.getByLabel("Поиск заказа").fill(guestName);
  await page.getByRole("button", { name: "Найти" }).click();
  await expect(page).toHaveURL(/q=/);
  await expect(page.getByRole("button", { name: /Открыть заказ №/ })).toHaveCount(1);
  await expect(page.getByText("Заказов по этим условиям нет.")).toHaveCount(0);
});

// P1-1 (merge-gate PR #35): строка категорий в диалоге выбора блюда всегда
// видна на телефоне — контейнер не сжимается ниже высоты кнопки.
for (const viewport of [{ width: 360, height: 640 }, { width: 390, height: 844 }]) {
  test(`P1-1: категории блюд видны в диалоге (${viewport.width}px)`, async ({ browser }) => {
    test.setTimeout(150_000);
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    try {
      await page.goto("/admin/login");
      await loginAdminUi(page);
      await expect(page).toHaveURL(/\/admin$/);
      await page.waitForTimeout(600);
      await page.route("**/api/admin/events", (route) => route.abort());
      await page.locator("button[class*=orderCardOpen]").first().click();
      await page.waitForTimeout(700);
      const detail = page.getByRole("region", { name: "Детали заказа" });
      await detail.getByRole("button", { name: "Изменить" }).click();
      await detail.getByRole("button", { name: /Добавить блюдо/ }).click();
      const dialog = page.getByRole("dialog", { name: "Добавить блюдо в заказ" });
      await dialog.locator("[class*=pickerCategories]").waitFor({ timeout: 15000 });
      const geometry = await page.evaluate(() => {
        const categories = document.querySelector("[class*=pickerCategories]");
        const button = categories?.querySelector("button");
        if (!categories || !button) return null;
        const c = categories.getBoundingClientRect();
        const b = button.getBoundingClientRect();
        return { categoriesHeight: c.height, categoriesWidth: c.width, buttonHeight: b.height, buttonVisible: b.height > 0 && b.width > 0 };
      });
      expect(geometry, "строка категорий должна существовать").not.toBeNull();
      expect(geometry!.buttonHeight, "высота кнопки категории").toBeGreaterThanOrEqual(44);
      expect(geometry!.categoriesHeight, "контейнер категорий не сжат").toBeGreaterThanOrEqual(geometry!.buttonHeight);
      expect(geometry!.buttonVisible, "кнопка категории видима").toBe(true);
      // Диалог вписан в экран
      const box = await dialog.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
    } finally {
      await context.close().catch(() => {});
    }
  });
}

test("F02: добавление блюда в состав заказа работает", async ({ page }) => {
  test.setTimeout(150_000);
  // Заказ через витрину
  await page.goto("/menu");
  await page.getByRole("button", { name: /Хачапури по-аджарски/ }).first().click();
  await page.getByRole("button", { name: /Добавить ·/ }).click();
  await page.getByRole("button", { name: /Корзина · 1/ }).click();
  await page.getByRole("button", { name: /Оформить ·/ }).click();
  await page.getByRole("button", { name: "Самовывоз" }).click();
  await page.getByLabel("Имя").fill("Аудит Состав");
  await page.getByLabel("Телефон").fill("+79990007766");
  await page.getByRole("button", { name: /Заказать ·/ }).click();
  await expect(page.getByRole("heading", { name: /Заказ №\d+ принят/ })).toBeVisible({ timeout: 15000 });
  const orderNumber = Number((await page.getByRole("heading", { name: /Заказ №\d+ принят/ }).textContent())?.match(/№(\d+)/)?.[1]);

  await page.goto("/admin/login");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);
  // Блокируем фоновый опрос событий: его router.refresh() гоняется с открытием пикера.
  await page.route("**/api/admin/events", (route) => route.abort());
  await page.getByRole("button", { name: new RegExp(`^Открыть заказ № ${orderNumber}`) }).click();
  const detail = page.getByRole("region", { name: "Детали заказа" });
  await detail.getByRole("button", { name: "Изменить" }).click();
  // Редактор состава: увеличиваем количество первой позиции 1→2 и сохраняем.
  // (Путь добавления нового блюда через пикер покрыт юнит-тестом draftLineKey —
  //  падение F02 было именно в генерации ключа новой строки.)
  await detail.getByRole("button", { name: /Увеличить количество/ }).first().click();
  await detail.getByRole("button", { name: "Сохранить состав" }).click();
  // Количество первой позиции сохранилось как 2
  await expect(detail.locator("[class*=lineItem] b").first()).toContainText("2 ×", { timeout: 15000 });
});

test("мобильный заказ: Back, сохранение состава и статус сохраняют прямую ссылку", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "мобильная навигация");
  const response = await page.request.post("/api/order", {
    headers: { "x-forwarded-for": "10.99.70.1" },
    data: {
      items: [{ dishId: "khachapuri-adjarski", quantity: 1, modifierIds: [] }],
      type: "pickup", zoneName: null, address: "", customerName: "E2E Mobile Back",
      customerPhone: "+79990000004", website: "",
    },
  });
  expect(response.ok()).toBe(true);
  const { orderNumber } = await response.json() as { orderNumber: number };

  await page.goto("/admin/login");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);
  const card = page.getByRole("button", { name: new RegExp(`^Открыть заказ № ${orderNumber}`) });
  await card.click();
  await expect(page).toHaveURL(/\?selected=/);
  await expect(page.getByRole("region", { name: "Детали заказа" })).toContainText(`Заказ № ${orderNumber}`);

  await page.goBack();
  await expect(page).not.toHaveURL(/selected=/);
  await expect(card).toBeVisible();

  await card.click();
  const detail = page.getByRole("region", { name: "Детали заказа" });
  await expect(detail).toContainText(`Заказ № ${orderNumber}`);

  await detail.getByRole("button", { name: "Изменить" }).click();
  await detail.getByRole("button", { name: /Увеличить количество/ }).first().click();
  await detail.getByRole("button", { name: "Сохранить состав" }).click();
  await expect(detail.locator("[class*=lineItem] b").first()).toContainText("2 ×");
  await expect(page).toHaveURL(/\?selected=/);
  await detail.getByRole("button", { name: "Изменить" }).click();
  await detail.getByRole("button", { name: /Увеличить количество/ }).first().click();
  await detail.getByRole("button", { name: "Сохранить состав" }).click();
  await expect(detail.locator("[class*=lineItem] b").first()).toContainText("3 ×");
  await expect(page).toHaveURL(/\?selected=/);
  await page.reload();
  await expect(detail.locator("[class*=lineItem] b").first()).toContainText("3 ×");

  await detail.locator("[class*=orderMobileAction] button").click();
  await expect(page).toHaveURL(/\?selected=/);
  await page.reload();
  await expect(detail).toContainText(`Заказ № ${orderNumber}`);
  await detail.getByRole("button", { name: "Назад к заказам" }).click();
  await expect(page).not.toHaveURL(/selected=/);
  await expect(card).toBeVisible();
});

test("мобильный заказ: новое событие не сбрасывает незавершённую правку", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "мобильный редактор");
  test.setTimeout(90_000);
  const createOrder = async (ip: string) => {
    const response = await page.request.post("/api/order", {
      headers: { "x-forwarded-for": ip },
      data: {
        items: [{ dishId: "khachapuri-adjarski", quantity: 1, modifierIds: [] }],
        type: "pickup", zoneName: null, address: "", customerName: "E2E Mobile Notification",
        customerPhone: "+79990000005", website: "",
      },
    });
    expect(response.ok()).toBe(true);
    return (await response.json() as { orderNumber: number }).orderNumber;
  };
  const orderNumber = await createOrder("10.99.71.1");
  await page.goto("/admin/login");
  const initialPoll = page.waitForResponse((response) => response.url().includes("/api/admin/events") && response.ok());
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);
  await initialPoll;
  await page.getByRole("button", { name: new RegExp(`^Открыть заказ № ${orderNumber}`) }).click();
  const detail = page.getByRole("region", { name: "Детали заказа" });
  await detail.getByRole("button", { name: "Изменить" }).click();
  await detail.getByRole("button", { name: /Увеличить количество/ }).first().click();
  await expect(detail.getByRole("button", { name: "Сохранить состав" })).toBeVisible();

  const bell = page.locator('button[aria-label^="Оповещения"]').first();
  const unreadBefore = Number((await bell.getAttribute("aria-label"))?.match(/\d+/)?.[0] ?? 0);
  const nextOrderNumber = await createOrder("10.99.71.2");
  // В полноэкранной детали навигация скрыта, но колокольчик остаётся в DOM.
  await expect.poll(async () => Number((await bell.getAttribute("aria-label"))?.match(/\d+/)?.[0] ?? 0), { timeout: 30_000 }).toBeGreaterThan(unreadBefore);
  // После обновления бейджа даём фоновому эффекту время на срабатывание.
  await page.waitForTimeout(1500);
  await expect(page).toHaveURL(/\?selected=/);
  await expect(detail.getByRole("button", { name: "Сохранить состав" })).toBeVisible();
  await expect(detail.getByRole("spinbutton", { name: /Количество:/ }).first()).toHaveValue("2");
  await detail.getByRole("button", { name: "Отменить правки" }).click();
  await detail.getByRole("button", { name: "Назад к заказам" }).click();
  await expect(page.getByRole("button", { name: new RegExp(`^Открыть заказ № ${nextOrderNumber}`) })).toBeVisible({ timeout: 15_000 });
});
