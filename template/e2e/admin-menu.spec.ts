import { test, expect } from "@playwright/test";
import { loginAdminUi, gotoAdmin } from "./login-admin";

// Issue #68: пустые категории скрыты на витрине (visibleMenuCategories), но в
// админке меню должны быть видны и управляемы (↑↓ ✎ 🗑) с пометкой о скрытии.
test("пустая категория видна в админке меню и скрыта на витрине", async ({ page }) => {
  await gotoAdmin(page, "/admin/login");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);

  await gotoAdmin(page, "/admin/menu");
  await expect(page.getByRole("heading", { name: "Меню", exact: true })).toBeVisible();

  // Создаём пустую категорию
  await page.getByRole("button", { name: "+ Категория" }).click();
  await page.getByLabel("Название").fill("E2E Пустая категория");
  await page.getByRole("button", { name: "Добавить" }).click();

  // Видна в списке с пометкой и доступными кнопками управления
  await expect(page.getByText("E2E Пустая категория")).toBeVisible();
  await expect(page.getByText("Пустая — скрыта на витрине.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Поднять категорию E2E Пустая категория выше" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Переименовать категорию E2E Пустая категория" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Удалить категорию E2E Пустая категория" })).toBeEnabled();

  // Переименование работает
  await page.getByRole("button", { name: "Переименовать категорию E2E Пустая категория" }).click();
  await page.getByLabel("Название").fill("E2E Пустая категория 2");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("E2E Пустая категория 2")).toBeVisible();

  // На витрине пустая категория не появляется
  await gotoAdmin(page, "/menu");
  await expect(page.getByText("E2E Пустая категория 2")).toHaveCount(0);

  // Удаление через UI
  await gotoAdmin(page, "/admin/menu");
  await page.getByRole("button", { name: "Удалить категорию E2E Пустая категория 2" }).click();
  await expect(page.getByText("Удалить категорию?")).toBeVisible();
  await page.getByRole("button", { name: "Удалить", exact: true }).click();
  await expect(page.getByText("E2E Пустая категория 2")).toHaveCount(0);
});
