import { expect, test } from "@playwright/test";
import { loginAdminUi } from "./login-admin";

async function save(page: import("@playwright/test").Page) {
  // На секции «Часы работы» две кнопки (расписание + часовой пояс) — берём первую (расписание).
  await page.getByRole("button", { name: "Сохранить", exact: true }).first().click();
  await expect(page.getByText("Сохранено ✓")).toBeVisible({ timeout: 15_000 });
}

test("S01/S02: две вкладки не теряют название при сохранении часов", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Конфликт вкладок проверяется в одном проекте");
  await page.goto("/admin/login");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/settings?section=restaurant");

  const name = page.getByLabel("Название", { exact: true });
  const originalName = await name.inputValue();
  const changedName = `${originalName} QA`;

  const hours = await context.newPage();
  await hours.goto("/admin/settings?section=hours");
  const start = hours.locator('input[type="time"]:not(:disabled)').first();
  const timeLabel = await start.getAttribute("aria-label");
  if (!timeLabel) throw new Error("Нет доступного рабочего дня");
  const originalTime = await start.inputValue();
  const changedTime = originalTime === "11:00" ? "11:15" : "11:00";

  try {
    await name.fill(changedName);
    await save(page);
    await start.fill(changedTime);
    await save(hours);

    const fresh = await context.newPage();
    await fresh.goto("/admin/settings?section=restaurant");
    expect(await fresh.getByLabel("Название", { exact: true }).inputValue() === changedName).toBe(true);
    await fresh.goto("/admin/settings?section=hours");
    expect(await fresh.getByLabel(timeLabel).inputValue() === changedTime).toBe(true);
    await fresh.close();
  } finally {
    const restore = await context.newPage();
    await restore.goto("/admin/settings?section=hours");
    if (await restore.getByLabel(timeLabel).inputValue() !== originalTime) {
      await restore.getByLabel(timeLabel).fill(originalTime);
      await save(restore);
    }
    await restore.goto("/admin/settings?section=restaurant");
    if (await restore.getByLabel("Название", { exact: true }).inputValue() !== originalName) {
      await restore.getByLabel("Название", { exact: true }).fill(originalName);
      await save(restore);
    }
    await restore.close();
  }
});

test("S01/S02: одна вкладка сохраняет обе секции подряд без ложного конфликта", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Последовательность секций проверяется в одном проекте");
  await page.goto("/admin/login");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/settings?section=restaurant");
  const originalName = await page.getByLabel("Название", { exact: true }).inputValue();
  const changedName = `${originalName} QA`;
  let originalTime = "";
  let timeLabel = "";
  try {
    await page.getByLabel("Название", { exact: true }).fill(changedName);
    await save(page);
    await page.getByRole("link", { name: "Часы работы" }).click();
    await expect(page).toHaveURL(/section=hours/);
    const start = page.locator('input[type="time"]:not(:disabled)').first();
    timeLabel = (await start.getAttribute("aria-label")) ?? "";
    if (!timeLabel) throw new Error("Нет доступного рабочего дня");
    originalTime = await start.inputValue();
    await start.fill(originalTime === "11:00" ? "11:15" : "11:00");
    await save(page);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("link", { name: "Данные и контакты" }).click();
    await expect(page.getByLabel("Название", { exact: true })).toHaveValue(changedName);
  } finally {
    await page.goto("/admin/settings?section=hours");
    if (timeLabel && originalTime && await page.getByLabel(timeLabel).inputValue() !== originalTime) {
      await page.getByLabel(timeLabel).fill(originalTime);
      await save(page);
    }
    await page.goto("/admin/settings?section=restaurant");
    await page.getByLabel("Название", { exact: true }).fill(originalName);
    await save(page);
  }
});

test("S01: устаревшая вкладка видит конфликт и принимает свежие данные", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Конфликт вкладок проверяется в одном проекте");
  await page.goto("/admin/login");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/settings?section=restaurant");
  const original = await page.getByLabel("Название", { exact: true }).inputValue();
  const firstValue = `${original} A`;
  const secondValue = `${original} B`;
  const second = await context.newPage();
  await second.goto("/admin/settings?section=restaurant");
  try {
    await page.getByLabel("Название", { exact: true }).fill(firstValue);
    await save(page);
    await second.getByLabel("Название", { exact: true }).fill(secondValue);
    await second.getByRole("button", { name: "Сохранить", exact: true }).click();
    const dialog = second.getByRole("dialog");
    await expect(dialog.getByText("Настройки изменены в другой вкладке")).toBeVisible();
    await dialog.getByRole("button", { name: "Обновить" }).click();
    await expect(second.getByLabel("Название", { exact: true })).toHaveValue(firstValue);
    await expect(dialog).toHaveCount(0);
    await second.getByLabel("Название", { exact: true }).fill(secondValue);
    await save(second);
    await second.reload();
    await expect(second.getByLabel("Название", { exact: true })).toHaveValue(secondValue);
  } finally {
    const restore = await context.newPage();
    await restore.goto("/admin/settings?section=restaurant");
    await restore.getByLabel("Название", { exact: true }).fill(original);
    await save(restore);
    await restore.close();
  }
});

test("S01: явное «Перезаписать» применяет правку устаревшей вкладки", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Конфликт вкладок проверяется в одном проекте");
  await page.goto("/admin/login");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/settings?section=restaurant");
  const original = await page.getByLabel("Название", { exact: true }).inputValue();
  const firstValue = `${original} A`;
  const secondValue = `${original} B`;
  const second = await context.newPage();
  await second.goto("/admin/settings?section=restaurant");
  try {
    await page.getByLabel("Название", { exact: true }).fill(firstValue);
    await save(page);
    await second.getByLabel("Название", { exact: true }).fill(secondValue);
    await second.getByRole("button", { name: "Сохранить", exact: true }).click();
    const dialog = second.getByRole("dialog");
    await expect(dialog.getByText("Настройки изменены в другой вкладке")).toBeVisible();
    await dialog.getByRole("button", { name: "Перезаписать" }).click();
    await expect(second.getByText("Сохранено ✓")).toBeVisible();
    await second.reload();
    await expect(second.getByLabel("Название", { exact: true })).toHaveValue(secondValue);
  } finally {
    const restore = await context.newPage();
    await restore.goto("/admin/settings?section=restaurant");
    await restore.getByLabel("Название", { exact: true }).fill(original);
    await save(restore);
    await restore.close();
  }
});
