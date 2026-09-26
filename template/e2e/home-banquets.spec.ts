import { test, expect } from "@playwright/test";
import { loginAdminUi } from "./login-admin";

test("UI-01/02: главная — hero, полное меню сразу после, контакты ниже меню", async ({ page }) => {
  await page.goto("/");
  // Кнопка «Заказать с доставкой» ведёт к меню на этой же странице
  const cta = page.getByRole("link", { name: "Заказать с доставкой" });
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute("href", "#menu");
  // Полное меню на главной
  await expect(page.locator("#menu")).toBeVisible();
  // Контакты ниже меню в DOM
  const menuPos = await page.locator("#menu").boundingBox();
  const contactsPos = await page.getByRole("heading", { name: "Контакты" }).boundingBox();
  expect(menuPos!.y).toBeLessThan(contactsPos!.y);
});

test("UI-03: старый /menu ведёт на /#menu", async ({ page }) => {
  await page.goto("/menu");
  await expect(page).toHaveURL(/\/#menu$/);
  await expect(page.locator("#menu")).toBeVisible();
});

test("UI-05: банкеты выключены → /banquets отдаёт 404, кнопки на главной нет", async ({ page, request }) => {
  const response = await request.get("/banquets");
  expect(response.status()).toBe(404);
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Банкеты" })).toHaveCount(0);
});

test("UI-04: админ включает банкеты → страница и кнопка появляются", async ({ page }) => {
  const hallName = `Зал Панорама ${Date.now().toString(36)}`;

  // Включаем раздел и создаём зал через админку
  await page.goto("/admin/login");
  await loginAdminUi(page);
  await page.waitForURL(/\/admin$/);

  await page.goto("/admin/banquets");
  await page.getByLabel(/Раздел «Банкеты» включён/).check();
  await page.getByRole("button", { name: "Сохранить настройки" }).click();
  await expect(page.getByText("Сохранено ✓")).toBeVisible({ timeout: 15000 });

  await page.getByRole("button", { name: "+ Зал" }).click();
  await page.getByPlaceholder("Название зала").fill(hallName);
  await page.getByPlaceholder("Вместимость").fill("до 40 гостей");
  await page.getByRole("button", { name: "Добавить зал" }).click();
  await expect(page.getByText(hallName)).toBeVisible({ timeout: 15000 });

  // Страница банкетов работает, зал виден
  await page.goto("/banquets");
  await expect(page.getByRole("heading", { name: hallName })).toBeVisible({ timeout: 15000 });

  // На главной появилась кнопка «Банкеты»
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Банкеты" })).toBeVisible();

  // Убираем за собой: выключаем раздел и удаляем зал
  await page.goto("/admin/banquets");
  await page.getByLabel(/Раздел «Банкеты» включён/).uncheck();
  await page.getByRole("button", { name: "Сохранить настройки" }).click();
  page.once("dialog", (d) => d.accept());
  await page.locator("div.bg-card", { hasText: hallName }).getByRole("button", { name: "Удалить" }).click();
  await expect(page.getByText(hallName)).toHaveCount(0, { timeout: 15000 });
});
