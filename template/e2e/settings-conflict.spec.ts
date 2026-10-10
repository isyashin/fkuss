import { test, expect, type Page } from "@playwright/test";
import { loginAdminUi } from "./login-admin";

// Регрессии конфликта версий настроек (F04 / P1-2, merge-gate PR #35):
// «Обновить» загружает свежие значения и сохраняет обе правки,
// «Перезаписать» явно затирает чужую правку.

const SECTION = "/admin/settings?section=payment";

// router.refresh() админки прерывает goto — повторяем переход один раз.
async function gotoStable(page: Page, path: string) {
  await page.goto(path, { waitUntil: "commit" }).catch(async () => {
    await page.waitForLoadState("load").catch(() => {});
    await page.goto(path, { waitUntil: "commit" });
  });
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function openPayment(page: Page) {
  await gotoStable(page, "/admin/login");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);
  await gotoStable(page, SECTION);
  await page.waitForTimeout(700);
}

async function readPair(page: Page) {
  return {
    cashback: Number(await page.getByLabel(/Кэшбэк/).inputValue()),
    maxSpend: Number(await page.getByLabel(/Списание бонусов до/).inputValue()),
  };
}

test("F04-обновить: конфликт вкладок, «Обновить» сохраняет обе правки", async ({ browser }) => {
  test.setTimeout(240_000);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const tab1 = await context.newPage();
  const tab2 = await context.newPage();
  let initial = { cashback: 5, maxSpend: 20 };
  try {
    await openPayment(tab1);
    await openPayment(tab2);
    initial = await readPair(tab1);
    // Уникальные значения для прогона, чтобы не совпасть с текущими.
    const nextCashback = initial.cashback === 33 ? 34 : 33;
    const nextMaxSpend = initial.maxSpend === 21 ? 22 : 21;

    // Вкладка 1: правит кэшбэк и сохраняет.
    await tab1.getByLabel(/Кэшбэк/).fill(String(nextCashback));
    await tab1.getByRole("button", { name: "Сохранить" }).click();
    await expect(tab1.getByText("Сохранено").first()).toBeVisible({ timeout: 15000 });

    // Вкладка 2 (устаревшая): правит предел списания → конфликт.
    await tab2.getByLabel(/Списание бонусов до/).fill(String(nextMaxSpend));
    await tab2.getByRole("button", { name: "Сохранить" }).click();
    await expect(tab2.getByText("Настройки изменены в другой вкладке")).toBeVisible({ timeout: 15000 });

    // «Обновить»: поля перезагружаются свежими значениями.
    await tab2.getByRole("button", { name: "Обновить", exact: true }).click();
    await expect(tab2.getByLabel(/Кэшбэк/)).toHaveValue(String(nextCashback), { timeout: 15000 });
    await expect(tab2.getByLabel(/Списание бонусов до/)).toHaveValue(String(initial.maxSpend), { timeout: 15000 });

    // Повторно применяем только свою правку и сохраняем.
    await tab2.getByLabel(/Списание бонусов до/).fill(String(nextMaxSpend));
    await tab2.getByRole("button", { name: "Сохранить" }).click();
    await expect(tab2.getByText("Сохранено").first()).toBeVisible({ timeout: 15000 });

    // Обе правки на сервере: первая вкладка видит обновлённую пару после reload.
    await tab1.reload();
    await expect(tab1.getByLabel(/Кэшбэк/)).toHaveValue(String(nextCashback), { timeout: 15000 });
    await expect(tab1.getByLabel(/Списание бонусов до/)).toHaveValue(String(nextMaxSpend), { timeout: 15000 });
  } finally {
    // Возвращаем исходные значения (лучшее усилие).
    try {
      await gotoStable(tab2, SECTION);
      await tab2.waitForTimeout(700);
      const now = await readPair(tab2);
      if (now.cashback !== initial.cashback) await tab2.getByLabel(/Кэшбэк/).fill(String(initial.cashback));
      if (now.maxSpend !== initial.maxSpend) await tab2.getByLabel(/Списание бонусов до/).fill(String(initial.maxSpend));
      const saveButton = tab2.getByRole("button", { name: "Сохранить" });
      if (await saveButton.isVisible().catch(() => false)) {
        await saveButton.click();
        await tab2.waitForTimeout(1200);
      }
    } catch { /* восстановление лучшее усилие */ }
    await context.close().catch(() => {});
  }
});

test("F04-перезаписать: явная перезапись затирает чужую правку", async ({ browser }) => {
  test.setTimeout(240_000);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const tab1 = await context.newPage();
  const tab2 = await context.newPage();
  let initial = { cashback: 5, maxSpend: 20 };
  try {
    await openPayment(tab1);
    await openPayment(tab2);
    initial = await readPair(tab1);
    const nextCashback = initial.cashback === 35 ? 36 : 35;

    await tab1.getByLabel(/Кэшбэк/).fill(String(nextCashback));
    await tab1.getByRole("button", { name: "Сохранить" }).click();
    await expect(tab1.getByText("Сохранено").first()).toBeVisible({ timeout: 15000 });

    // Вкладка 2 правит предел списания → конфликт → «Перезаписать».
    const nextMaxSpend = initial.maxSpend === 23 ? 24 : 23;
    await tab2.getByLabel(/Списание бонусов до/).fill(String(nextMaxSpend));
    await tab2.getByRole("button", { name: "Сохранить" }).click();
    await expect(tab2.getByText("Настройки изменены в другой вкладке")).toBeVisible({ timeout: 15000 });
    await tab2.getByRole("button", { name: "Перезаписать" }).click();
    await expect(tab2.getByText("Сохранено").first()).toBeVisible({ timeout: 15000 });

    // Перезапись затирает чужую правку: кэшбэк возвращается к значению вкладки 2.
    await tab1.reload();
    await expect(tab1.getByLabel(/Кэшбэк/)).toHaveValue(String(initial.cashback), { timeout: 15000 });
    await expect(tab1.getByLabel(/Списание бонусов до/)).toHaveValue(String(nextMaxSpend), { timeout: 15000 });
  } finally {
    try {
      await gotoStable(tab2, SECTION);
      await tab2.waitForTimeout(700);
      await tab2.getByLabel(/Кэшбэк/).fill(String(initial.cashback));
      await tab2.getByLabel(/Списание бонусов до/).fill(String(initial.maxSpend));
      const saveButton = tab2.getByRole("button", { name: "Сохранить" });
      if (await saveButton.isVisible().catch(() => false)) {
        await saveButton.click();
        await tab2.waitForTimeout(1200);
      }
    } catch { /* восстановление лучшее усилие */ }
    await context.close().catch(() => {});
  }
});
