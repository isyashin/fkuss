import { test, expect } from "@playwright/test";
import { loginAdminUi } from "./login-admin";

// Регрессионные сценарии аудита админки (08.10.2026):
// F01 — поиск заказов серверный (q в URL, пустое состояние), F02 — добавление
// блюда в состав заказа не падает на HTTP-стенде (crypto.randomUUID).

test("F01: поиск заказов по имени фильтрует список и объясняет пустой результат", async ({ page }) => {
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

  // Существующий гость из сид-контента: список фильтруется
  await page.getByLabel("Поиск заказа").fill("Финальный");
  await page.getByRole("button", { name: "Найти" }).click();
  await expect(page).toHaveURL(/q=/);
  await expect(page.locator("button[aria-label^='Открыть заказ']")).not.toHaveCount(0);
});

test("F02: добавление блюда в состав заказа работает", async ({ page }) => {
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
  await expect(page.getByText(/Заказ №\d+ принят/)).toBeVisible({ timeout: 15000 });
  const orderNumber = Number((await page.getByText(/Заказ №\d+ принят/).textContent())?.match(/№(\d+)/)?.[1]);

  await page.goto("/admin/login");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole("button", { name: new RegExp(`^Открыть заказ № ${orderNumber}`) }).click();
  const detail = page.getByRole("region", { name: "Детали заказа" });
  await detail.getByRole("button", { name: "Изменить" }).click();
  await detail.getByRole("button", { name: /Добавить блюдо/ }).click();
  await detail.getByLabel("Добавить блюдо").selectOption({ index: 1 });
  await detail.getByRole("button", { name: "Добавить" }).click();
  await detail.getByRole("button", { name: "Сохранить состав" }).click();
  await expect(detail.getByText(/новое блюдо|2 ×/)).toBeVisible({ timeout: 15000 });
});
