import { test, expect } from "@playwright/test";

// Админка: вход по паролю, список заказов, смена статуса
test("ресторатор входит в админку и двигает заказ по статусам", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);

  await page.getByPlaceholder("Пароль").fill("admin");
  await page.getByRole("button", { name: "Войти" }).click();

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Заказы" })).toBeVisible();

  // Берём первый заказ со статусом «Новый» и принимаем его
  const newOrder = page.locator("div", { hasText: "Новый" }).last();
  if (await newOrder.getByRole("button", { name: "Принять" }).isVisible().catch(() => false)) {
    await newOrder.getByRole("button", { name: "Принять" }).click();
    await expect(page.getByText("Принят").first()).toBeVisible();
  }
});

test("админка без пароля уводит на логин", async ({ page }) => {
  await page.goto("/admin/settings");
  await expect(page).toHaveURL(/\/admin\/login/);
});
