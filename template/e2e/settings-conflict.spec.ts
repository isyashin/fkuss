import { test, expect, type Page } from "@playwright/test";
import { loginAdminUi } from "./login-admin";

// Регрессии конфликта версий настроек (F04 / P1-2, merge-gate PR #35):
// «Обновить» загружает свежие значения и сохраняет обе правки,
// «Перезаписать» явно затирает чужую правку.

const SECTION = "/admin/settings?section=payment";

// router.refresh() админки прерывает goto — повторяем переход.
// НЕ ждём networkidle: админка постоянно опрашивает /api/admin/events.
async function gotoStable(page: Page, path: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(path, { timeout: 30_000, waitUntil: "load" });
      return;
    } catch (cause) {
      if (attempt === 2) throw cause;
      await page.waitForTimeout(500);
    }
  }
}

async function openPayment(page: Page) {
  await gotoStable(page, "/admin/login");
  // Уже авторизованы (общая сессия контекста) — логин-форма не покажется.
  if (await page.getByLabel("Логин").isVisible().catch(() => false)) {
    await loginAdminUi(page);
    await expect(page).toHaveURL(/\/admin$/, { timeout: 20_000 });
  }
  await gotoStable(page, SECTION);
  await page.getByLabel(/Кэшбэк/).waitFor({ timeout: 20_000 });
}

async function readPair(page: Page) {
  return {
    cashback: Number(await page.getByLabel(/Кэшбэк/).inputValue()),
    maxSpend: Number(await page.getByLabel(/Списание бонусов до/).inputValue()),
  };
}

// Дожидается серверных значений через reload-зонд: server actions применяются
// асинхронно, поэтому одного reload сразу после клика может не хватить.
async function waitForServerPair(page: Page, expected: { cashback: number; maxSpend: number }, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let last = { cashback: NaN, maxSpend: NaN };
  while (Date.now() < deadline) {
    await page.reload({ waitUntil: "load" }).catch(() => {});
    await page.getByLabel(/Кэшбэк/).waitFor({ timeout: 10000 }).catch(() => {});
    last = await readPair(page).catch(() => last);
    if (last.cashback === expected.cashback && last.maxSpend === expected.maxSpend) return last;
    await page.waitForTimeout(800);
  }
  throw new Error(`Сервер не вернул ожидаемую пару: ждали ${JSON.stringify(expected)}, последнее ${JSON.stringify(last)}`);
}

test("F04-обновить: конфликт вкладок, «Обновить» сохраняет обе правки", async ({ browser }, testInfo) => {
  // Логика конфликта не зависит от вьюпорта; на мобильных проектах пропускаем,
  // чтобы трёхкратный прогон не раздувал CI (геометрия мобильного покрыта в admin-audit).
  test.skip(testInfo.project.name !== "desktop", "конфликт вкладок: только десктопный проект");
  test.setTimeout(300_000);
  const t0 = Date.now();
  const mark = (step: string) => console.log(`[conflict +${((Date.now() - t0) / 1000).toFixed(0)}s] ${step}`);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const tab1 = await context.newPage();
  const tab2 = await context.newPage();
  let initial = { cashback: 5, maxSpend: 20 };
  try {
    await openPayment(tab1);
    mark("tab1 открыта");
    await openPayment(tab2);
    mark("tab2 открыта");
    initial = await readPair(tab1);
    // Уникальные значения для прогона, чтобы не совпасть с текущими.
    const nextCashback = initial.cashback === 33 ? 34 : 33;
    const nextMaxSpend = initial.maxSpend === 21 ? 22 : 21;

    // Вкладка 1: правит кэшбэк и сохраняет. Статус «Сохранено» живёт в savebar
    // и исчезает вместе с ней после успеха — синхронизируемся по исчезновению кнопки.
    await tab1.getByLabel(/Кэшбэк/).fill(String(nextCashback));
    await tab1.getByRole("button", { name: "Сохранить" }).click();
    mark("tab1 сохранила кэшбэк");
    await tab1.getByRole("button", { name: "Сохранить" }).waitFor({ state: "hidden", timeout: 15000 });

    // Вкладка 2 (устаревшая): правит предел списания → конфликт.
    await tab2.getByLabel(/Списание бонусов до/).fill(String(nextMaxSpend));
    await tab2.getByRole("button", { name: "Сохранить" }).click();
    mark("tab2 попыталась сохранить");
    await expect(tab2.getByText("Настройки изменены в другой вкладке")).toBeVisible({ timeout: 15000 });
    mark("конфликт показан");

    // «Обновить»: поля перезагружаются свежими значениями.
    await tab2.getByRole("button", { name: "Обновить", exact: true }).click();
    mark("нажали «Обновить»");
    await expect(tab2.getByLabel(/Кэшбэк/)).toHaveValue(String(nextCashback), { timeout: 15000 });
    await expect(tab2.getByLabel(/Списание бонусов до/)).toHaveValue(String(initial.maxSpend), { timeout: 15000 });
    mark("поля обновлены свежими значениями");

    // Повторно применяем только свою правку и сохраняем.
    await tab2.getByLabel(/Списание бонусов до/).fill(String(nextMaxSpend));
    await tab2.getByRole("button", { name: "Сохранить" }).click();
    mark("tab2 повторно сохранила");
    await tab2.getByRole("button", { name: "Сохранить" }).waitFor({ state: "hidden", timeout: 15000 });

    // Обе правки на сервере: первая вкладка видит обновлённую пару после reload.
    const pair = await waitForServerPair(tab1, { cashback: nextCashback, maxSpend: nextMaxSpend });
    mark("tab1 перезагружена");
    expect(pair.cashback).toBe(nextCashback);
    expect(pair.maxSpend).toBe(nextMaxSpend);
    mark("ОБЕ ПРАВКИ ПОДТВЕРЖДЕНЫ");
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

test("F04-последовательные: две правки и два сохранения в одной вкладке без reload не конфликтуют", async ({ browser }, testInfo) => {
  // P1, аудит 11.10: после успешной записи клиент обязан принять новую ревизию,
  // иначе второе сохранение в той же вкладке ложно показывает диалог конфликта.
  test.skip(testInfo.project.name !== "desktop", "конфликт вкладок: только десктопный проект");
  test.setTimeout(240_000);
  const t0 = Date.now();
  const mark = (step: string) => console.log(`[conflict +${((Date.now() - t0) / 1000).toFixed(0)}s] ${step}`);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  let initial = { cashback: 5, maxSpend: 20 };
  try {
    await openPayment(page);
    initial = await readPair(page);
    const first = initial.cashback === 31 ? 32 : 31;
    const second = initial.cashback === 33 ? 34 : 33;

    await page.getByLabel(/Кэшбэк/).fill(String(first));
    await page.getByRole("button", { name: "Сохранить" }).click();
    await page.getByRole("button", { name: "Сохранить" }).waitFor({ state: "hidden", timeout: 15000 });
    mark("первое сохранение принято");

    await page.getByLabel(/Кэшбэк/).fill(String(second));
    await page.getByRole("button", { name: "Сохранить" }).click();
    await page.getByRole("button", { name: "Сохранить" }).waitFor({ state: "hidden", timeout: 15000 });
    mark("второе сохранение принято");
    await expect(page.getByText("Настройки изменены в другой вкладке")).toHaveCount(0);
    mark("ложного конфликта нет");

    const pair = await waitForServerPair(page, { cashback: second, maxSpend: initial.maxSpend });
    expect(pair.cashback).toBe(second);
    mark("ДВА ПОСЛЕДОВАТЕЛЬНЫХ СОХРАНЕНИЯ ПОДТВЕРЖДЕНЫ");
  } finally {
    try {
      await gotoStable(page, SECTION);
      await page.getByLabel(/Кэшбэк/).waitFor({ timeout: 15000 }).catch(() => {});
      const now = await readPair(page);
      if (now.cashback !== initial.cashback) await page.getByLabel(/Кэшбэк/).fill(String(initial.cashback));
      const saveButton = page.getByRole("button", { name: "Сохранить" });
      if (await saveButton.isVisible().catch(() => false)) {
        await saveButton.click();
        await page.waitForTimeout(1200);
      }
    } catch { /* восстановление лучшее усилие */ }
    await context.close().catch(() => {});
  }
});

test("F04-последовательные: двойное сохранение в разделе бронирования", async ({ browser }, testInfo) => {
  // Тот же регресс в другом версионированном редакторе (saveSettings через хук).
  test.skip(testInfo.project.name !== "desktop", "конфликт вкладок: только десктопный проект");
  test.setTimeout(240_000);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  let initialGuests = 0;
  try {
    await gotoStable(page, "/admin/login");
    if (await page.getByLabel("Логин").isVisible().catch(() => false)) {
      await loginAdminUi(page);
      await expect(page).toHaveURL(/\/admin$/, { timeout: 20_000 });
    }
    await gotoStable(page, "/admin/settings?section=booking");
    const guests = page.getByLabel(/Гостей на слот, макс/);
    await guests.waitFor({ timeout: 20000 });
    initialGuests = Number(await guests.inputValue());
    const first = initialGuests === 7 ? 8 : 7;
    const second = initialGuests === 9 ? 10 : 9;

    await guests.fill(String(first));
    await page.getByRole("button", { name: "Сохранить" }).click();
    await page.getByRole("button", { name: "Сохранить" }).waitFor({ state: "hidden", timeout: 15000 });
    await guests.fill(String(second));
    await page.getByRole("button", { name: "Сохранить" }).click();
    await page.getByRole("button", { name: "Сохранить" }).waitFor({ state: "hidden", timeout: 15000 });
    await expect(page.getByText("Настройки изменены в другой вкладке")).toHaveCount(0);

    // Серверное значение после reload — второе сохранение.
    const deadline = Date.now() + 20000;
    let last = NaN;
    while (Date.now() < deadline) {
      await page.reload({ waitUntil: "load" }).catch(() => {});
      await guests.waitFor({ timeout: 10000 }).catch(() => {});
      last = Number(await guests.inputValue().catch(() => String(last)));
      if (last === second) break;
      await page.waitForTimeout(800);
    }
    expect(last).toBe(second);
  } finally {
    try {
      await gotoStable(page, "/admin/settings?section=booking");
      const guests = page.getByLabel(/Гостей на слот, макс/);
      await guests.waitFor({ timeout: 15000 }).catch(() => {});
      await guests.fill(String(initialGuests));
      const saveButton = page.getByRole("button", { name: "Сохранить" });
      if (await saveButton.isVisible().catch(() => false)) {
        await saveButton.click();
        await page.waitForTimeout(1200);
      }
    } catch { /* восстановление лучшее усилие */ }
    await context.close().catch(() => {});
  }
});

test("F04-разделы: сохранение в оплате не затирается после переключения разделов", async ({ browser }, testInfo) => {
  // Аудит 11.10: переключение payment → booking → payment не должно подхватывать
  // устаревший закэшированный фрагмент с полным объектом settings и затирать
  // сохранённое поле при повторной записи.
  test.skip(testInfo.project.name !== "desktop", "конфликт вкладок: только десктопный проект");
  test.setTimeout(240_000);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  let initial = { cashback: 5, maxSpend: 20 };
  try {
    await openPayment(page);
    initial = await readPair(page);
    const first = initial.cashback === 41 ? 42 : 41;
    const second = initial.cashback === 43 ? 44 : 43;

    await page.getByLabel(/Кэшбэк/).fill(String(first));
    await page.getByRole("button", { name: "Сохранить" }).click();
    await page.getByRole("button", { name: "Сохранить" }).waitFor({ state: "hidden", timeout: 15000 });

    // Уходим в другой раздел и возвращаемся: редактор пересоздаётся из props.
    await gotoStable(page, "/admin/settings?section=booking");
    await page.getByRole("heading", { name: "Бронирование" }).waitFor({ timeout: 20000 });
    await gotoStable(page, SECTION);
    await page.getByLabel(/Кэшбэк/).waitFor({ timeout: 20000 });
    await expect(page.getByLabel(/Кэшбэк/)).toHaveValue(String(first), { timeout: 15000 });

    // Повторная правка после возвращения: полный объект записи не должен
    // вернуть старое значение кэшбэка.
    await page.getByLabel(/Кэшбэк/).fill(String(second));
    await page.getByRole("button", { name: "Сохранить" }).click();
    await page.getByRole("button", { name: "Сохранить" }).waitFor({ state: "hidden", timeout: 15000 });
    await expect(page.getByText("Настройки изменены в другой вкладке")).toHaveCount(0);

    const pair = await waitForServerPair(page, { cashback: second, maxSpend: initial.maxSpend });
    expect(pair.cashback).toBe(second);
  } finally {
    try {
      await gotoStable(page, SECTION);
      await page.getByLabel(/Кэшбэк/).waitFor({ timeout: 15000 }).catch(() => {});
      const now = await readPair(page);
      if (now.cashback !== initial.cashback) await page.getByLabel(/Кэшбэк/).fill(String(initial.cashback));
      const saveButton = page.getByRole("button", { name: "Сохранить" });
      if (await saveButton.isVisible().catch(() => false)) {
        await saveButton.click();
        await page.waitForTimeout(1200);
      }
    } catch { /* восстановление лучшее усилие */ }
    await context.close().catch(() => {});
  }
});

test("F04-перезаписать: явная перезапись затирает чужую правку", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "конфликт вкладок: только десктопный проект");
  test.setTimeout(300_000);
  const t0 = Date.now();
  const mark = (step: string) => console.log(`[conflict +${((Date.now() - t0) / 1000).toFixed(0)}s] ${step}`);
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
    mark("tab1 сохранила кэшбэк");
    await tab1.getByRole("button", { name: "Сохранить" }).waitFor({ state: "hidden", timeout: 15000 });

    // Вкладка 2 правит предел списания → конфликт → «Перезаписать».
    const nextMaxSpend = initial.maxSpend === 23 ? 24 : 23;
    await tab2.getByLabel(/Списание бонусов до/).fill(String(nextMaxSpend));
    await tab2.getByRole("button", { name: "Сохранить" }).click();
    mark("tab2 попыталась сохранить");
    await expect(tab2.getByText("Настройки изменены в другой вкладке")).toBeVisible({ timeout: 15000 });
    await tab2.getByRole("button", { name: "Перезаписать" }).click();
    mark("нажали «Перезаписать»");
    // Перезапись идёт через хук асинхронно: ждём серверных значений reload-зондом.
    // Перезапись возвращает кэшбэк к устаревшему значению вкладки 2 и пишет её предел.
    const pair = await waitForServerPair(tab1, { cashback: initial.cashback, maxSpend: nextMaxSpend });
    mark("tab1 перезагружена");
    expect(pair.cashback).toBe(initial.cashback);
    expect(pair.maxSpend).toBe(nextMaxSpend);
    mark("ПЕРЕЗАПИСЬ ПОДТВЕРЖДЕНА");
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
