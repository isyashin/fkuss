import { test, expect } from "@playwright/test";
import { loginAdminUi } from "./login-admin";

// Сид с флагом SEED_TWO_MENUS=1: группа «Тестовое меню 2» с категорией
// «Категория второго меню» (блюдо dish-e2e-second); основное меню незагруппировано.
test("несколько меню: переключатель на витрине, смешанный заказ, пометки в админке", async ({ page }) => {
  await page.goto("/menu");
  const switcher = page.getByTestId("menu-switch");
  await expect(switcher).toBeVisible();
  await expect(switcher.getByRole("tab", { name: "Тестовое меню 2" })).toBeVisible();
  await expect(switcher.getByRole("tab", { name: "Меню" })).toBeVisible(); // незагруппированные

  // По умолчанию активна первая группа → её категории в табах
  const tabs = page.getByTestId("menu-tabs");
  await expect(tabs.getByRole("tab", { name: /Категория второго меню/ })).toBeVisible();

  // Блюдо из второго меню
  await page.getByTestId("dish-card").filter({ hasText: "Блюдо второго меню" }).first().click();
  await page.getByRole("button", { name: /Добавить ·/ }).click();
  await page.waitForTimeout(300);

  // Переключаемся на основное меню — добавляем обычное блюдо (смешанная корзина)
  await switcher.getByRole("tab", { name: "Меню" }).click();
  await page.waitForTimeout(300);
  await page.getByTestId("dish-card").first().click();
  await page.getByRole("button", { name: /Добавить ·/ }).click();
  await page.waitForTimeout(300);

  // Оформляем самовывоз
  await page.getByRole("button", { name: /Корзина · 2/ }).click();
  await page.getByRole("button", { name: /Оформить ·/ }).click();
  await page.getByRole("button", { name: "Самовывоз" }).click();
  await page.getByLabel("Имя").fill("Тест Мультименю");
  await page.getByLabel("Телефон").fill("+79990001144");
  await page.getByRole("button", { name: /Заказать ·/ }).click();
  const ok = page.getByText(/Заказ №\d+ принят/);
  await ok.waitFor({ timeout: 15000 });
  const orderNumber = Number(((await ok.textContent()) ?? "").match(/№(\d+)/)?.[1]);

  // Админка: у позиции бейдж группы, в сводке — обе группы
  await page.goto("/admin/login");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole("button", { name: `Открыть заказ № ${orderNumber}` }).click();
  const detail = page.getByRole("region", { name: "Детали заказа" });
  await expect(detail.getByText("Блюдо второго меню")).toBeVisible();
  await expect(detail.locator("span", { hasText: "Тестовое меню 2" }).first()).toBeVisible();
  await expect(detail.getByText(/Меню заказа: Тестовое меню 2 ×1/)).toBeVisible();
});
