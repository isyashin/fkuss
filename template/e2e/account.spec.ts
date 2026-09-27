import { test, expect, type Page } from "@playwright/test";

// Личный кабинет гостя: профиль, адреса, заказ → детали → повтор → отмена.

async function loginAsFreshCustomer(page: Page, request: import("@playwright/test").APIRequestContext, tag: string) {
  const email = `account-${tag}-${Date.now()}@example.com`;
  const codeResponse = await request.post("/api/auth/request-code", {
    data: { email },
    headers: { "x-forwarded-for": "10.99.30.1" },
  });
  const { devCode } = await codeResponse.json();
  await request.post("/api/auth/verify", { data: { email, code: devCode } });
  const cookies = await request.storageState();
  await page.context().addCookies(cookies.cookies);
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: /Здравствуйте/ })).toBeVisible();
}

test("гость управляет профилем и адресами", async ({ page, request }, testInfo) => {
  testInfo.setTimeout(90_000);
  await loginAsFreshCustomer(page, request, "profile");

  // Профиль: имя и телефон
  await page.getByRole("button", { name: "Изменить имя и телефон" }).click();
  await page.getByLabel("Имя").fill("Гость Тест");
  await page.getByLabel("Телефон").fill("+79990002211");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByText("Сохранено ✓")).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Гость Тест").first()).toBeVisible();

  // Адрес: добавить → изменить → удалить
  await page.getByRole("button", { name: "+ Адрес" }).click();
  await page.getByLabel("Улица и дом").fill("Тестовая 1");
  await page.getByLabel("Квартира").fill("5");
  await page.getByRole("button", { name: "Сохранить адрес" }).click();
  await expect(page.getByText(/Тестовая 1/)).toBeVisible({ timeout: 15000 });

  await page.getByRole("button", { name: "Изменить адрес" }).click();
  await page.getByLabel("Улица и дом").fill("Тестовая 2");
  await page.getByRole("button", { name: "Сохранить изменения" }).click();
  await expect(page.getByText(/Тестовая 2/)).toBeVisible({ timeout: 15000 });

  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Удалить адрес" }).click();
  await expect(page.getByText(/Тестовая 2/)).toHaveCount(0, { timeout: 15000 });
});

test("заказ гостя: детали, повтор и отмена из кабинета", async ({ page, request }, testInfo) => {
  testInfo.setTimeout(120_000);
  await loginAsFreshCustomer(page, request, "order");

  // Заказ через витрину (сессия уже в контексте → заказ привяжется к гостю)
  await page.setExtraHTTPHeaders({ "x-forwarded-for": "10.99.31.1" });
  await page.goto("/menu");
  await page.getByRole("button", { name: /Хачапури по-аджарски/ }).click();
  const addButton = page.getByRole("button", { name: /Добавить ·/ });
  await expect(addButton).toBeVisible();
  await addButton.click();
  await page.getByRole("button", { name: /Корзина · 1/ }).click();
  await page.getByRole("button", { name: /Оформить ·/ }).click();
  await page.getByRole("button", { name: "Самовывоз" }).click();
  await page.getByLabel("Имя").fill("Гость Тест");
  await page.getByLabel("Телефон").fill("+79990002212");
  await page.getByRole("button", { name: /Заказать ·/ }).click();
  await expect(page.getByText(/Заказ №\d+ принят/)).toBeVisible({ timeout: 15000 });

  // Кабинет: заказ в списке с действиями
  await page.goto("/account");
  await expect(page.getByRole("link", { name: /Заказ №/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Повторить" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Отменить" }).first()).toBeVisible();

  // Детали: состав и итог
  await page.getByRole("link", { name: /Заказ №/ }).first().click();
  await expect(page.getByRole("heading", { name: /Заказ №/ })).toBeVisible();
  await expect(page.getByText("Состав")).toBeVisible();
  await expect(page.getByText("Итого")).toBeVisible();

  // Повтор: позиции ушли в корзину
  await page.getByRole("button", { name: "Повторить" }).click();
  await expect(page.getByRole("button", { name: /Корзина · 1/ })).toBeVisible({ timeout: 15000 });

  // Отмена заказа из кабинета
  await page.goto("/account");
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Отменить" }).first().click();
  await expect(page.getByText("Отменён").first()).toBeVisible({ timeout: 15000 });
});
