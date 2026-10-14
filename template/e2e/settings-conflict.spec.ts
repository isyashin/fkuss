import { test, expect, type Page } from "@playwright/test";
import { loginAdminUi } from "./login-admin";

// Регрессии конфликта версий настроек (F04 / P1-2, merge-gate PR #35):
// «Обновить» загружает свежие значения и сохраняет обе правки,
// «Перезаписать» явно затирает чужую правку.

const SECTION = "/admin/settings?section=loyalty";

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

// Синхронизация после клика «Сохранить»: кнопка теперь всегда на месте и лишь
// блокируется без изменений (issue #59) — ждём статус «Сохранено» в панели раздела.
// После успеха «Сохранено» дублируется в rd.saved под формой — берём span в savebar.
async function waitSaved(page: Page) {
  await expect(
    page
      .locator('section[aria-label="Бонусы и лояльность"], section[aria-label="Параметры бронирования"]')
      .locator("span[role='status']"),
  ).toHaveText("Сохранено", { timeout: 15000 });
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

    // Вкладка 1: правит кэшбэк и сохраняет. Синхронизируемся по статусу «Сохранено»
    // (кнопка после успеха остаётся на месте, но блокируется — issue #59).
    await tab1.getByLabel(/Кэшбэк/).fill(String(nextCashback));
    await tab1.getByRole("button", { name: "Сохранить" }).click();
    mark("tab1 сохранила кэшбэк");
    await waitSaved(tab1);

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
    await waitSaved(tab2);

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
    await waitSaved(page);
    mark("первое сохранение принято");

    await page.getByLabel(/Кэшбэк/).fill(String(second));
    await page.getByRole("button", { name: "Сохранить" }).click();
    await waitSaved(page);
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
    await waitSaved(page);
    await guests.fill(String(second));
    await page.getByRole("button", { name: "Сохранить" }).click();
    await waitSaved(page);
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
    await waitSaved(page);

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
    await waitSaved(page);
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

test("F04-разделы: правка «Связи с гостем» не тихо теряется сохранением оплаты из устаревшей вкладки", async ({ browser }, testInfo) => {
  // P1, аудит 11.10: запись каналов связи не бампила _rev, поэтому оплата из
  // ранее открытой вкладки сохраняла полный устаревший объект без конфликта
  // и возвращала WhatsApp. Теперь любая запись строки settings бампит _rev —
  // устаревшая вкладка получает диалог конфликта, а «Обновить» сохраняет обе
  // правки.
  test.skip(testInfo.project.name !== "desktop", "конфликт вкладок: только десктопный проект");
  test.setTimeout(300_000);
  const t0 = Date.now();
  const mark = (step: string) => console.log(`[conflict +${((Date.now() - t0) / 1000).toFixed(0)}s] ${step}`);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const contactTab = await context.newPage();
  const paymentTab = await context.newPage();
  const CONTACT = "/admin/settings?section=guest-contact";
  let whatsappInitially = true;
  let cashbackInitial = 5;
  try {
    // Вкладка 2 (оплата) открыта ПЕРВОЙ — её ревизия зафиксирована до правки связи.
    await openPayment(paymentTab);
    const paymentInitial = await readPair(paymentTab);
    cashbackInitial = paymentInitial.cashback;
    const nextCashback = cashbackInitial === 45 ? 46 : 45;

    // Вкладка 1: связь с гостем — выключаем WhatsApp (auto-save бампит _rev).
    await gotoStable(contactTab, "/admin/login");
    await gotoStable(contactTab, CONTACT);
    const waRow = contactTab.locator("label", { hasText: "WhatsApp" }).first();
    await waRow.waitFor({ timeout: 20000 });
    const waCheckbox = waRow.locator("input[type=checkbox]");
    whatsappInitially = await waCheckbox.isChecked();
    const targetWa = !whatsappInitially;
    await waCheckbox.setChecked(targetWa);
    // Тогл сохраняет сразу — ждём статус авто-сохранения.
    await expect(contactTab.getByRole("status")).toContainText("Сохранено", { timeout: 15000 });
    await expect(contactTab.getByText("Настройки изменены в другой вкладке")).toHaveCount(0);
    mark(`WhatsApp -> ${targetWa} сохранено`);

    // Устаревшая вкладка оплаты сохраняет полный объект — конфликт обязан появиться.
    await paymentTab.getByLabel(/Кэшбэк/).fill(String(nextCashback));
    await paymentTab.getByRole("button", { name: "Сохранить" }).click();
    mark("оплата попыталась сохранить устаревший объект");
    // Запись связи бампнула _rev — конфликт обязан появиться.
    await expect(paymentTab.getByText("Настройки изменены в другой вкладке")).toBeVisible({ timeout: 15000 });
    mark("конфликт показан");

    // «Обновить» → свежие props (с выключенным WhatsApp) → повторная правка.
    await paymentTab.getByRole("button", { name: "Обновить", exact: true }).click();
    // Сброс редактора — асинхронный эффект эпохи: сначала ждём свежие
    // значения полей, иначе введённая правка перезапишется сбросом.
    await expect(paymentTab.getByLabel(/Кэшбэк/)).toHaveValue(String(cashbackInitial), { timeout: 15000 });
    await paymentTab.getByLabel(/Кэшбэк/).fill(String(nextCashback));
    await paymentTab.getByRole("button", { name: "Сохранить" }).click();
    await waitSaved(paymentTab);
    mark("оплата сохранена после «Обновить»");

    // Обе правки на сервере: WhatsApp остался выключенным, кэшбэк обновлён.
    await gotoStable(contactTab, CONTACT);
    await waRow.waitFor({ timeout: 20000 });
    await expect(waCheckbox).toBeChecked({ checked: targetWa, timeout: 15000 });
    const pair = await waitForServerPair(paymentTab, { cashback: nextCashback, maxSpend: paymentInitial.maxSpend });
    expect(pair.cashback).toBe(nextCashback);
    mark("ОБЕ ПРАВКИ (СВЯЗЬ + ОПЛАТА) ПОДТВЕРЖДЕНЫ");
  } finally {
    try {
      await gotoStable(contactTab, CONTACT);
      const waRow = contactTab.locator("label", { hasText: "WhatsApp" }).first();
      await waRow.waitFor({ timeout: 15000 }).catch(() => {});
      const waCheckbox = waRow.locator("input[type=checkbox]");
      if (await waCheckbox.isChecked() !== whatsappInitially) {
        await waCheckbox.setChecked(whatsappInitially);
        await contactTab.waitForTimeout(1500);
      }
      await gotoStable(paymentTab, SECTION);
      await paymentTab.getByLabel(/Кэшбэк/).waitFor({ timeout: 15000 }).catch(() => {});
      const now = await readPair(paymentTab).catch(() => null);
      if (now && now.cashback !== cashbackInitial) {
        await paymentTab.getByLabel(/Кэшбэк/).fill(String(cashbackInitial));
        const savePayment = paymentTab.getByRole("button", { name: "Сохранить" });
        if (await savePayment.isVisible().catch(() => false)) { await savePayment.click(); await paymentTab.waitForTimeout(1500); }
      }
    } catch { /* восстановление лучшее усилие */ }
    await context.close().catch(() => {});
  }
});

test("F04-разделы: автосохранение связи → оплата в той же вкладке без ложного конфликта", async ({ browser }, testInfo) => {
  // Аудит 12.10: автосохранение каналов бампит _rev серверно; вкладка обязана
  // принять ревизию, иначе её же сохранение оплаты ложно конфликтует.
  test.skip(testInfo.project.name !== "desktop", "конфликт вкладок: только десктопный проект");
  test.setTimeout(240_000);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  let whatsappInitially = true;
  let initial = { cashback: 5, maxSpend: 20 };
  try {
    await gotoStable(page, "/admin/login");
    if (await page.getByLabel("Логин").isVisible().catch(() => false)) {
      await loginAdminUi(page);
      await expect(page).toHaveURL(/\/admin$/, { timeout: 20_000 });
    }
    // 1) Связь с гостем: тоглим WhatsApp, авто-сохранение сразу.
    await gotoStable(page, "/admin/settings?section=guest-contact");
    const waRow = page.locator("label", { hasText: "WhatsApp" }).first();
    await waRow.waitFor({ timeout: 20000 });
    const waCheckbox = waRow.locator("input[type=checkbox]");
    whatsappInitially = await waCheckbox.isChecked();
    await waCheckbox.setChecked(!whatsappInitially);
    await expect(page.getByRole("status")).toContainText("Сохранено", { timeout: 15000 });

    // 2) Оплата в той же вкладке: сохранение проходит без конфликта.
    await gotoStable(page, SECTION);
    await page.getByLabel(/Кэшбэк/).waitFor({ timeout: 20000 });
    initial = await readPair(page);
    const nextCashback = initial.cashback === 47 ? 48 : 47;
    await page.getByLabel(/Кэшбэк/).fill(String(nextCashback));
    await page.getByRole("button", { name: "Сохранить" }).click();
    await waitSaved(page);
    await expect(page.getByText("Настройки изменены в другой вкладке")).toHaveCount(0);
    const pair = await waitForServerPair(page, { cashback: nextCashback, maxSpend: initial.maxSpend });
    expect(pair.cashback).toBe(nextCashback);
  } finally {
    try {
      await gotoStable(page, "/admin/settings?section=guest-contact");
      const waRow = page.locator("label", { hasText: "WhatsApp" }).first();
      await waRow.waitFor({ timeout: 15000 }).catch(() => {});
      const waCheckbox = waRow.locator("input[type=checkbox]");
      if (await waCheckbox.isChecked() !== whatsappInitially) {
        await waCheckbox.setChecked(whatsappInitially);
        await page.waitForTimeout(1500);
      }
      await gotoStable(page, SECTION);
      await page.getByLabel(/Кэшбэк/).waitFor({ timeout: 15000 }).catch(() => {});
      const now = await readPair(page).catch(() => null);
      if (now && now.cashback !== initial.cashback) {
        await page.getByLabel(/Кэшбэк/).fill(String(initial.cashback));
        const saveButton = page.getByRole("button", { name: "Сохранить" });
        if (await saveButton.isVisible().catch(() => false)) { await saveButton.click(); await page.waitForTimeout(1500); }
      }
    } catch { /* восстановление лучшее усилие */ }
    await context.close().catch(() => {});
  }
});

test("F04-разделы: сохранение банкетов → оплата в той же вкладке без ложного конфликта", async ({ browser }, testInfo) => {
  // Тот же регресс для банкетов (сохранение кнопкой, не авто) — аудит 12.10.
  test.skip(testInfo.project.name !== "desktop", "конфликт вкладок: только десктопный проект");
  test.setTimeout(240_000);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  let ctaInitially = "";
  let initial = { cashback: 5, maxSpend: 20 };
  try {
    await gotoStable(page, "/admin/login");
    if (await page.getByLabel("Логин").isVisible().catch(() => false)) {
      await loginAdminUi(page);
      await expect(page).toHaveURL(/\/admin$/, { timeout: 20_000 });
    }
    // 1) Банкеты: меняем текст CTA и сохраняем.
    await gotoStable(page, "/admin/settings?section=banquets");
    const cta = page.getByLabel(/Текст CTA-кнопки/);
    await cta.waitFor({ timeout: 20000 });
    ctaInitially = await cta.inputValue();
    const nextCta = ctaInitially.includes("аудит") ? `${ctaInitially}.` : `${ctaInitially} аудит`;
    await cta.fill(nextCta);
    await page.getByRole("button", { name: "Сохранить настройки" }).click();
    await expect(page.getByText("Сохранено ✓")).toBeVisible({ timeout: 15000 });

    // 2) Оплата в той же вкладке: сохранение проходит без конфликта.
    await gotoStable(page, SECTION);
    await page.getByLabel(/Кэшбэк/).waitFor({ timeout: 20000 });
    initial = await readPair(page);
    const nextCashback = initial.cashback === 49 ? 50 : 49;
    await page.getByLabel(/Кэшбэк/).fill(String(nextCashback));
    await page.getByRole("button", { name: "Сохранить" }).click();
    await waitSaved(page);
    await expect(page.getByText("Настройки изменены в другой вкладке")).toHaveCount(0);
    const pair = await waitForServerPair(page, { cashback: nextCashback, maxSpend: initial.maxSpend });
    expect(pair.cashback).toBe(nextCashback);
  } finally {
    try {
      await gotoStable(page, "/admin/settings?section=banquets");
      const cta = page.getByLabel(/Текст CTA-кнопки/);
      await cta.waitFor({ timeout: 15000 }).catch(() => {});
      if ((await cta.inputValue().catch(() => ctaInitially)) !== ctaInitially) {
        await cta.fill(ctaInitially);
        const saveBanquets = page.getByRole("button", { name: "Сохранить настройки" });
        if (await saveBanquets.isVisible().catch(() => false)) { await saveBanquets.click(); await page.waitForTimeout(1500); }
      }
      await gotoStable(page, SECTION);
      await page.getByLabel(/Кэшбэк/).waitFor({ timeout: 15000 }).catch(() => {});
      const now = await readPair(page).catch(() => null);
      if (now && now.cashback !== initial.cashback) {
        await page.getByLabel(/Кэшбэк/).fill(String(initial.cashback));
        const saveButton = page.getByRole("button", { name: "Сохранить" });
        if (await saveButton.isVisible().catch(() => false)) { await saveButton.click(); await page.waitForTimeout(1500); }
      }
    } catch { /* восстановление лучшее усилие */ }
    await context.close().catch(() => {});
  }
});

test("F04-поздняя правка: чужая запись после «Обновить» не затирается молча", async ({ browser }, testInfo) => {
  // Аудит 12.10: флаг acceptRevWithoutBump обязан не проглатывать более свежую
  // ревизию. Сохранение вкладки 2 после поздней правки вкладки 1 обязано
  // показать конфликт (а не приняться и затирать чужую правку).
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
    const first = initial.cashback === 51 ? 52 : 51;
    const late = initial.cashback === 53 ? 54 : 53;
    const own = initial.cashback === 55 ? 56 : 55;

    // Вкладка 1 сохраняет первую правку → у вкладки 2 конфликт → «Обновить».
    await tab1.getByLabel(/Кэшбэк/).fill(String(first));
    await tab1.getByRole("button", { name: "Сохранить" }).click();
    await waitSaved(tab1);
    await tab2.getByLabel(/Списание бонусов до/).fill(String(initial.maxSpend === 25 ? 26 : 25));
    await tab2.getByRole("button", { name: "Сохранить" }).click();
    await expect(tab2.getByText("Настройки изменены в другой вкладке")).toBeVisible({ timeout: 15000 });
    // Детерминированность: не даём фоновому опросу доставить позднюю ревизию
    // раньше сохранения вкладки 2 — конфликт обязан вычислиться замороженной
    // версией вкладки.
    await tab2.route("**/api/admin/events", (route) => route.abort());
    await tab2.getByRole("button", { name: "Обновить", exact: true }).click();
    await expect(tab2.getByLabel(/Кэшбэк/)).toHaveValue(String(first), { timeout: 15000 });
    mark("вкладка 2 обновилась к версии первой правки");

    // Поздняя чужая правка: вкладка 1 сохраняет ещё раз до сохранения вкладки 2.
    await tab1.getByLabel(/Кэшбэк/).fill(String(late));
    await tab1.getByRole("button", { name: "Сохранить" }).click();
    await waitSaved(tab1);
    mark("вкладка 1 сохранила позднюю правку");

    // Вкладка 2 применяет свою правку и сохраняет: конфликт обязан появиться.
    await tab2.getByLabel(/Кэшбэк/).fill(String(own));
    await tab2.getByRole("button", { name: "Сохранить" }).click();
    await expect(tab2.getByText("Настройки изменены в другой вкладке")).toBeVisible({ timeout: 15000 });
    mark("поздняя правка не проглочена — конфликт показан");

    // «Обновить» → свежие значения → повторная правка → обе сохранены.
    await tab2.getByRole("button", { name: "Обновить", exact: true }).click();
    await expect(tab2.getByLabel(/Кэшбэк/)).toHaveValue(String(late), { timeout: 15000 });
    await tab2.getByLabel(/Кэшбэк/).fill(String(own));
    await tab2.getByRole("button", { name: "Сохранить" }).click();
    await waitSaved(tab2);
    const pair = await waitForServerPair(tab1, { cashback: own, maxSpend: initial.maxSpend });
    expect(pair.cashback).toBe(own);
    mark("ПОЗДНЯЯ ПРАВКА НЕ ПОТЕРЯНА");
  } finally {
    try {
      await gotoStable(tab2, SECTION);
      await tab2.getByLabel(/Кэшбэк/).waitFor({ timeout: 15000 }).catch(() => {});
      const now = await readPair(tab2).catch(() => null);
      if (now && now.cashback !== initial.cashback) {
        await tab2.getByLabel(/Кэшбэк/).fill(String(initial.cashback));
        const saveButton = tab2.getByRole("button", { name: "Сохранить" });
        if (await saveButton.isVisible().catch(() => false)) { await saveButton.click(); await tab2.waitForTimeout(1500); }
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
    await waitSaved(tab1);

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
