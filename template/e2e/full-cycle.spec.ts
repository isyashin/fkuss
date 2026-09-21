import { test, expect } from "@playwright/test";

// Полный цикл лояльности: вход → заказ → админ «выполнен» → кэшбэк в кабинете
test("цикл бонусов: заказ → выполнение → кэшбэк виден в кабинете", async ({ page, request }, testInfo) => {
  // 1. Вход по email-коду (dev). Отдельный rate-limit бакет — иначе 5/час на IP
  const email = `e2e-loyalty-${testInfo.project.name}-${Date.now()}@example.com`;
  const authIp = { "x-forwarded-for": `10.99.11.${testInfo.project.name === "webkit-mobile" ? 3 : testInfo.project.name.includes("mobile") ? 1 : 2}` };
  const codeResponse = await request.post("/api/auth/request-code", { data: { email }, headers: authIp });
  const { devCode } = await codeResponse.json();
  const verifyResponse = await request.post("/api/auth/verify", { data: { email, code: devCode } });
  expect(verifyResponse.ok()).toBe(true);
  const cookies = await request.storageState();
  await page.context().addCookies(cookies.cookies);

  // Отдельный rate-limit бакет на проект (заказ идёт через браузерный fetch)
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `10.99.9.${testInfo.project.name === "webkit-mobile" ? 3 : testInfo.project.name.includes("mobile") ? 1 : 2}`,
  });

  // 2. Заказ с этим email
  await page.goto("/menu");
  await page.getByRole("button", { name: /Хачапури по-аджарски/ }).click();
  await page.getByRole("button", { name: /Добавить ·/ }).click();
  await page.getByRole("button", { name: /Корзина · 1/ }).click();
  await page.getByRole("button", { name: /Оформить ·/ }).click();
  await page.getByRole("button", { name: "Самовывоз" }).click();
  await page.getByLabel("Имя").fill("Тест Лояльности");
  await page.getByLabel("Телефон").fill("+79990001144");
  await page.getByLabel(/Email/).fill(email);
  await page.getByRole("button", { name: /Заказать ·/ }).click();
  await expect(page.getByText(/Заказ №\d+ принят/)).toBeVisible({ timeout: 15000 });

  const orderText = await page.getByText(/Заказ №\d+ принят/).textContent();
  const orderNumber = Number(orderText?.match(/№(\d+)/)?.[1]);

  // 3. Админ переводит заказ в «выполнен»
  await page.goto("/admin/login");
  await page.getByPlaceholder("Пароль").fill("admin");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/\/admin$/);

  const orderCard = page.locator("div.bg-card", { hasText: `№${orderNumber} ` }).first();
  await expect(orderCard).toBeVisible();
  // new → accepted → cooking → done
  await orderCard.getByRole("button", { name: "Принять" }).click();
  await page.waitForTimeout(500);
  await page.locator("div.bg-card", { hasText: `№${orderNumber} ` }).first().getByRole("button", { name: "Готовится" }).click();
  await page.waitForTimeout(500);
  await page.locator("div.bg-card", { hasText: `№${orderNumber} ` }).first().getByRole("button", { name: "Выполнен" }).click();
  await page.waitForTimeout(500);

  // 4. Кабинет: баланс бонусов > 0 (5% от 490 = 24)
  await page.goto("/account");
  await expect(page.getByText("Бонусы")).toBeVisible();
  const balanceText = await page.locator("p.text-3xl").textContent();
  expect(Number(balanceText?.replace(/\D/g, ""))).toBe(24);
});
