import { test, expect } from "@playwright/test";

// Полный сценарий: меню → карточка блюда → корзина → оформление заказа (без оплаты)

test("гость заказывает блюдо с главной через корзину", async ({ page }, testInfo) => {
  await page.setExtraHTTPHeaders({
    "x-forwarded-for": `10.99.10.${testInfo.project.name === "mobile" ? 1 : 2}`,
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
  await expect(page.getByText(/Заказ №\d+ принят/)).toBeVisible({ timeout: 15000 });
});

test("форма брони отправляется", async ({ page }, testInfo) => {
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
