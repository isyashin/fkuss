import { test, expect } from "@playwright/test";

// Полный сценарий: меню → карточка блюда → корзина → оформление заказа (без оплаты)

test("гость заказывает блюдо с главной через корзину", async ({ page }, testInfo) => {
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `10.99.10.${testInfo.project.name === "webkit-mobile" ? 3 : testInfo.project.name.includes("mobile") ? 1 : 2}`,
  });
  await page.goto("/menu");

  // Открываем карточку блюда
  await page.getByRole("button", { name: /Хачапури по-аджарски/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  // Модификатор + количество
  await page.getByLabel(/Двойной сыр/).check();

  const addButton = page.getByRole("button", { name: /Добавить ·/ });
  await expect(addButton).toBeVisible();
  await addButton.click();

  // Sticky-панель корзины появилась
  const cartBar = page.getByRole("button", { name: /Корзина · 1/ });
  await expect(cartBar).toBeVisible();
  await cartBar.click();

  // В шторке — переход к оформлению
  await page.getByRole("button", { name: /Оформить ·/ }).click();

  // Самовывоз, чтобы не заполнять адрес
  await page.getByRole("button", { name: "Самовывоз" }).click();
  await page.getByLabel("Имя").fill("Тест E2E");
  await page.getByLabel("Телефон").fill("+79990001133");

  await page.getByRole("button", { name: /Заказать ·/ }).click();

  // Успех: номер заказа
  await expect(page.getByRole("heading", { name: /Заказ №\d+ принят/ })).toBeVisible({ timeout: 15000 });
});

test("submit чекаута виден без прокрутки на mobile-360 (elementFromPoint)", async ({ page }) => {
  await page.goto("/menu");

  await page.getByRole("button", { name: /Хачапури по-аджарски/ }).click();
  await page.getByRole("button", { name: /Добавить ·/ }).click();
  // Два блюда — проходим минимальную сумму доставки (800 ₽)
  await page.getByRole("button", { name: /Хачапури по-аджарски/ }).click();
  await page.getByRole("button", { name: /Добавить ·/ }).click();
  await page.getByRole("button", { name: /Корзина · 2/ }).click();
  await page.getByRole("button", { name: /Оформить ·/ }).click();

  // Доставка + адрес: форма длинная и гарантированно не помещается в шторку
  await page.getByRole("button", { name: "Доставка" }).click();
  await page.getByLabel("Адрес").fill("ул. Тестовая, 1");
  await page.getByLabel("Имя").fill("Тест E2E");
  await page.getByLabel("Телефон").fill("+79990001458");

  const scroller = page.locator('[role="dialog"] .overflow-y-auto');
  await expect
    .poll(async () => scroller.evaluate((el) => el.scrollHeight - el.clientHeight))
    .toBeGreaterThan(100);

  const submit = page.getByRole("button", { name: /Заказать ·/ });
  await expect(submit).toBeEnabled();

  // Гость прокрутил форму наверх: submit всё равно должен быть на экране и кликабелен
  await scroller.evaluate((el) => {
    el.scrollTop = 0;
  });
  const clickable = await submit.evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (r.bottom > window.innerHeight || r.top < 0) return false;
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit === el || (hit !== null && el.contains(hit));
  });
  expect(clickable).toBe(true);
});

test("форма брони отправляется", async ({ page }) => {
  await page.goto("/booking");
  // Будущий будний день + уникальный слот прогона (вместимость слота не накапливается между прогонами)
  const stamp = Math.floor(Date.now() / 60000);
  const hour = 12 + (stamp % 9); // 12:00–20:00
  const minute = stamp % 2 === 0 ? "00" : "30";
  const time = `${String(hour).padStart(2, "0")}:${minute}`;
  const daysAhead = 7 + (stamp % 20);
  const date = new Date(Date.now() + daysAhead * 86400000).toISOString().slice(0, 10);

  await page.getByRole("textbox", { name: "Дата" }).fill(date);
  await page.getByRole("combobox", { name: "Время" }).selectOption(time, { timeout: 15000 });
  await page.getByLabel("Имя").fill("Тест E2E");
  await page.getByLabel("Телефон").fill("+79990001133");
  await page.getByRole("button", { name: "Забронировать" }).click();
  await expect(page.getByText("Заявка отправлена")).toBeVisible({ timeout: 15000 });
});

test("форма брони не принимает ввод до гидратации", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "desktop", "мобильная регрессия раннего ввода");

  let releaseScripts = () => {};
  const scriptsBlocked = new Promise<void>((resolve) => { releaseScripts = resolve; });
  await page.route(/\/_next\/static\/.*\.js(?:\?|$)/, async (route) => {
    await scriptsBlocked;
    await route.continue();
  });

  await page.goto("/booking", { waitUntil: "commit" });
  const date = page.getByRole("textbox", { name: "Дата" });
  try {
    await date.waitFor({ state: "attached" });
    await expect(date).toBeDisabled();
  } finally {
    releaseScripts();
  }

  await expect(date).toBeEnabled({ timeout: 30000 });
  await date.fill(new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10));
  await expect(page.getByRole("combobox", { name: "Время" })).toBeEnabled({ timeout: 15000 });
});

test("бронь вне часов работы отклоняется", async ({ request }) => {
  // 03:00 ночи — ресторан закрыт
  const response = await request.post("/api/booking", {
    data: {
      date: "2027-01-06",
      time: "03:00",
      guests: 2,
      customerName: "Тест E2E",
      customerPhone: "+79990001133",
    },
  });
  expect(response.status()).toBe(400);
  const data = await response.json();
  expect(data.error).toContain("часы работы");
});
