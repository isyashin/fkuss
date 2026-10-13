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

  // Создаём пустую категорию. Оба диалога (создание/переименование) всегда в DOM,
  // поэтому сужаем до видимого — иначе strict mode violation на getByLabel.
  await page.getByRole("button", { name: "+ Категория" }).click();
  const createDialog = page.locator("dialog").filter({ visible: true });
  await createDialog.getByLabel("Название").fill("E2E Пустая категория");
  await createDialog.getByRole("button", { name: "Добавить" }).click();

  // Видна в списке с пометкой и доступными кнопками управления.
  // Список — <section aria-label="Список блюд">; имя категории также попадает
  // в <option> фильтра, поэтому ищем точно по абзацу-заголовку в списке.
  const list = page.getByRole("region", { name: "Список блюд" });
  await expect(list.locator("p").filter({ hasText: /^E2E Пустая категория$/ })).toBeVisible();
  await expect(list.getByText("Пустая — скрыта на витрине.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Поднять категорию E2E Пустая категория выше" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Переименовать категорию E2E Пустая категория" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Удалить категорию E2E Пустая категория" })).toBeEnabled();

  // Переименование работает
  await page.getByRole("button", { name: "Переименовать категорию E2E Пустая категория" }).click();
  const renameDialog = page.locator("dialog").filter({ visible: true });
  await renameDialog.getByLabel("Название").fill("E2E Пустая категория 2");
  await renameDialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(list.locator("p").filter({ hasText: /^E2E Пустая категория 2$/ })).toBeVisible();

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

// Issue #50: sticky-панель «Отмена/Сохранить» не должна перекрывать «Удалить блюдо».
// Проект desktop — 1280px, mobile-360 — 360px.
test("«Удалить блюдо» кликабельна целиком, savebar её не перекрывает", async ({ page }) => {
  await gotoAdmin(page, "/admin/login");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);

  await gotoAdmin(page, "/admin/menu");
  await page.getByRole("button", { name: /Открыть блюдо/ }).first().click();
  const deleteButton = page.getByRole("button", { name: "Удалить блюдо" });
  await expect(deleteButton).toBeVisible();

  // Доскролливаем до конца: на mobile кнопка должна лечь выше фиксированного savebar.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(deleteButton).toBeVisible();

  // Вся площадь кнопки принадлежит ей: центр и края не перекрыты savebar.
  // Диагностика: если что-то перекрывает, в ошибке видно, какой элемент
  // вернул elementFromPoint для каждой контрольной точки.
  const probe = await deleteButton.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const points: Array<[number, number]> = [
      [rect.left + rect.width / 2, rect.top + rect.height / 2],
      [rect.left + 2, rect.top + 2],
      [rect.right - 2, rect.bottom - 2],
      [rect.left + rect.width / 2, rect.bottom - 2],
    ];
    const hits = points.map(([x, y]) => {
      const hit = document.elementFromPoint(x, y);
      const label = hit
        ? `${hit.tagName}.${String((hit as HTMLElement).className).slice(0, 80)}«${(hit.textContent ?? "").trim().slice(0, 40)}»`
        : "null";
      return { x: Math.round(x), y: Math.round(y), label, own: hit !== null && (hit === element || element.contains(hit)) };
    });
    return { rect: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) }, scrollY: Math.round(window.scrollY), innerHeight: window.innerHeight, hits };
  });
  expect(probe.hits.every((hit) => hit.own), JSON.stringify(probe)).toBe(true);

  // Клик по центру открывает диалог подтверждения (не уходит в savebar).
  await deleteButton.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Удалить блюдо?")).toBeVisible();
  await dialog.getByRole("button", { name: "Отмена" }).click();
  await expect(dialog.getByText("Удалить блюдо?")).toHaveCount(0);
});
