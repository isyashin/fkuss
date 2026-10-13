import { test, expect, type APIRequestContext } from "@playwright/test";
import pg from "pg";
import { gotoAdmin, loginAdminUi } from "./login-admin";

/**
 * Точные ссылки админки: переход из push-уведомления должен открывать запись,
 * а истёкшая сессия — возвращать в неё же после входа (?next=).
 */

const E2E_DB = new pg.Client({ connectionString: process.env.DATABASE_URL ?? "" });
let dbConnected = false;

test.beforeAll(async () => {
  if (process.env.DATABASE_URL) {
    await E2E_DB.connect();
    dbConnected = true;
  }
});

test.afterAll(async () => {
  if (dbConnected) await E2E_DB.end().catch(() => {});
});

let orderSeq = 0;
async function createPickupOrder(request: APIRequestContext): Promise<{ id: string; number: number }> {
  // Свой IP-подсеть: не давим лимит 5 заказов/10 мин на общий IP проекта
  orderSeq += 1;
  const response = await request.post("/api/order", {
    headers: { "x-forwarded-for": `10.99.60.${orderSeq}` },
    data: {
      items: [{ dishId: "khachapuri-adjarski", quantity: 1, modifierIds: [] }],
      type: "pickup",
      zoneName: null,
      address: "",
      customerName: "E2E DeepLink",
      customerPhone: "+79990000099",
      website: "",
    },
  });
  expect(response.ok()).toBe(true);
  const { orderNumber } = (await response.json()) as { orderNumber: number };
  const { rows } = await E2E_DB.query('SELECT id FROM "Order" WHERE number = $1', [orderNumber]);
  return { id: rows[0].id as string, number: orderNumber };
}

test("истёкшая сессия: ?next= возвращает в нужный раздел после входа", async ({ page }) => {
  await page.goto("/admin/bookings");
  await expect(page).toHaveURL(/\/admin\/login\?next=/);
  const next = decodeURIComponent((new URL(page.url())).searchParams.get("next") ?? "");
  expect(next).toBe("/admin/bookings");

  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin\/bookings/);
});

test("/admin/orders без сессии редиректит на логин, а не 404", async ({ page }) => {
  await page.goto("/admin/orders");
  await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Forders$/);
});

test("/admin/orders для вошедшего ведёт на дашборд заказов", async ({ page }) => {
  await page.goto("/admin/login");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);

  await gotoAdmin(page, "/admin/orders");
  await expect(page).toHaveURL(/\/admin(\?.*)?$/);
  await expect(page.getByRole("region", { name: "Список заказов" })).toBeVisible();
});

test("карточка заказа открывается по /admin/orders/{id} без 404", async ({ page, request }) => {
  test.skip(!process.env.DATABASE_URL, "нужен DATABASE_URL тестовой БД");
  const order = await createPickupOrder(request);

  await page.goto("/admin/login");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);

  await gotoAdmin(page, `/admin/orders/${order.id}`);
  await expect(page).toHaveURL(new RegExp(`\\/admin\\?selected=${order.id}$`));
  const detail = page.getByRole("region", { name: "Детали заказа" });
  await expect(detail).toContainText(new RegExp(`Заказ №\\s*${order.number}`), { timeout: 20_000 });
});

test("вход с внешним next отклоняется — после входа корень админки", async ({ page }) => {
  await page.goto("/admin/login?next=https%3A%2F%2Fevil.example%2Fadmin");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);
});

test("уже вошедший по ссылке с next попадает в цель", async ({ page }) => {
  await page.goto("/admin/login");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/login?next=%2Fadmin%2Fbookings");
  await expect(page).toHaveURL(/\/admin\/bookings/);
});

test("заказ открывается по ?selected= и Back возвращает к списку", async ({ page, request }) => {
  test.skip(!process.env.DATABASE_URL, "нужен DATABASE_URL тестовой БД");
  const order = await createPickupOrder(request);

  await page.goto("/admin/login");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);

  await gotoAdmin(page, `/admin?selected=${order.id}`);
  const detail = page.getByRole("region", { name: "Детали заказа" });
  await expect(detail).toContainText(new RegExp(`Заказ №\\s*${order.number}`), { timeout: 20_000 });

  await page.goBack();
  await expect(page).toHaveURL(/\/admin(\?.*)?$/);
});

test("бронь открывается по ?selected=", async ({ page, request }) => {
  const guestName = `E2E DeepLink Бронь ${Date.now().toString(36)}`;
  const response = await request.post("/api/booking", {
    data: { date: "2026-12-20", time: "18:00", guests: 2, customerName: guestName, customerPhone: "+79990000098", website: "" },
  });
  expect(response.ok()).toBe(true);
  const { id } = (await response.json()) as { id: string };

  await page.goto("/admin/login");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);

  await gotoAdmin(page, `/admin/bookings?selected=${id}`);
  await expect(page.getByRole("region", { name: "Детали брони" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("region", { name: "Детали брони" }).getByText(guestName)).toBeVisible();
});

/** Колокольчик ведёт в конкретную запись: событие появляется со ссылкой ?selected=. */
test("ссылка события в панели уведомлений открывает запись", async ({ page, request }) => {
  test.skip(!process.env.DATABASE_URL, "нужен DATABASE_URL тестовой БД");
  const order = await createPickupOrder(request);

  await page.goto("/admin/login");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);

  // Поллинг вкладки (~10 с) сам подхватит событие и покажет в панели. Оболочка
  // рендерит ДВА экземпляра колокольчика (rail + topbar) с общим tabId: receipt
  // забирает один из них, поэтому ссылку ищем по всей странице, а не в панели .first().
  const bell = page.getByRole("button", { name: /Оповещения/ }).first();
  await expect(bell).toBeVisible();
  await bell.click();
  const link = page.getByRole("link", { name: new RegExp(`Заказ №\\s*${order.number}`) });
  await expect(link).toBeVisible({ timeout: 30_000 });
  await expect(link).toHaveAttribute("href", new RegExp(`^/admin\\?selected=${order.id}$`));
});

test("после выхода и повторного входа колокольчик не показывает события прежней сессии", async ({ page, request }) => {
  test.skip(!process.env.DATABASE_URL, "нужен DATABASE_URL тестовой БД");
  const order = await createPickupOrder(request);

  await page.goto("/admin/login");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);
  const bell = page.getByRole("button", { name: /Оповещения/ }).first();
  await bell.click();
  const eventName = new RegExp(`Заказ №\\s*${order.number}`);
  await expect(page.getByRole("region", { name: "Новые события" }).getByRole("link", { name: eventName })).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /Профиль/ }).click();
  await page.getByRole("button", { name: "Выйти" }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole("button", { name: /Оповещения/ }).first().click();
  await expect(page.getByRole("region", { name: "Новые события" }).getByRole("link", { name: eventName })).toHaveCount(0);
});
