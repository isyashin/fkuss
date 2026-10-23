import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import type { ContentSettings } from "@/lib/content-schema";
import { CLOSED_WITHOUT_SLOTS, CLOSED_WITH_SLOTS } from "@/lib/order/availability";

// Use the real API and SSR, with an isolated fixture restored after each case.
test.use({ serviceWorkers: "block" });
let pool: Pool;
let original: { key: string; value: unknown }[];
let options: unknown[];
let settings: ContentSettings;
test.beforeEach(async () => {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  original = (await pool.query('SELECT key,value FROM "Settings" WHERE key = ANY($1::text[])', [["settings", "restaurant"]])).rows;
  options = (await pool.query('SELECT * FROM "DeliveryOption"')).rows;
  settings = structuredClone(original.find(r => r.key === "settings")!.value) as ContentSettings;
  settings.delivery = { ...settings.delivery, enabled: true, pickupEnabled: true, minOrder: 0, geo: { enabled: false, outside: "block", outsidePrice: 0 } };
  settings.preOrder = { enabled: false, slots: [], daysAhead: 1, minAheadMinutes: 30 };
  await pool.query('DELETE FROM "DeliveryOption"');
  await schedule(false);
  await save();
});
test.afterEach(async () => {
  try {
    for (const row of original ?? []) await pool.query('UPDATE "Settings" SET value=$2::jsonb WHERE key=$1', [row.key, JSON.stringify(row.value)]);
    if (options) {
      await pool.query('DELETE FROM "DeliveryOption"');
      await pool.query('INSERT INTO "DeliveryOption" SELECT * FROM jsonb_populate_recordset(NULL::"DeliveryOption",$1::jsonb)', [JSON.stringify(options)]);
    }
  } finally { await pool.end(); }
});
async function save() { await pool.query('UPDATE "Settings" SET value=$1::jsonb WHERE key=$2', [JSON.stringify(settings), "settings"]); }
async function schedule(open: boolean) {
  const restaurant = structuredClone(original.find(r => r.key === "restaurant")!.value) as Record<string, unknown>;
  restaurant.schedule = { days: Object.fromEntries(["mon","tue","wed","thu","fri","sat","sun"].map(d => [d,{open,from:"00:00",to:"00:00"}])), exceptions: [] };
  await pool.query('UPDATE "Settings" SET value=$1::jsonb WHERE key=$2', [JSON.stringify(restaurant), "restaurant"]);
}
async function option(mode: "asap" | "scheduled", enabled = true) {
  await pool.query('INSERT INTO "DeliveryOption" (id,name,mode,enabled,days,"hoursFrom","hoursTo","slotMinutes","minAheadMinutes","daysAhead",price,exceptions) VALUES ($1,$2,$3,$4,ARRAY[0,1,2,3,4,5,6],$5,$6,60,60,1,0,ARRAY[]::text[])', ["closed-qa","Курьер",mode,enabled,"00:00","23:59"]);
}
async function checkout(page: Page) {
  await page.getByTestId("dish-card").first().click();
  await page.getByRole("button", { name: /Добавить ·/ }).click();
  await page.getByRole("button", { name: /Корзина · 1/ }).click();
  await page.getByRole("button", { name: /Оформить ·/ }).click();
  const cart = page.getByRole("dialog");
  await cart.getByLabel("Имя", { exact: true }).fill("QA Closed");
  await cart.getByLabel("Телефон", { exact: true }).fill("+79990000001");
  return cart;
}
test("closed Fuji-like storefront and checkout never offer an unavailable preorder", async ({ page }) => {
  await option("asap");
  await page.goto("/menu");
  await expect(page.getByTestId("order-availability-notice")).toHaveText(CLOSED_WITHOUT_SLOTS);
  const cart = await checkout(page);
  await expect(cart.getByRole("button", { name: "Самовывоз", exact: true })).toHaveClass(/bg-accent/);
  await expect(cart.getByRole("status")).toHaveText(CLOSED_WITHOUT_SLOTS);
  await expect(cart.getByRole("radio", { name: "Предзаказ ко времени" })).toHaveCount(0);
  await expect(cart.getByRole("button", { name: /^Заказать/ })).toBeDisabled();
});
test("real future pickup times remain selectable while closed", async ({ page }) => {
  settings.delivery.enabled = false;
  settings.preOrder = { enabled: true, slots: ["12:00"], daysAhead: 1, minAheadMinutes: 30 }; await save();
  await page.goto("/");
  await expect(page.getByTestId("order-availability-notice")).toHaveText(CLOSED_WITH_SLOTS);
  const cart = await checkout(page);
  await expect(cart.getByRole("radio", { name: "Предзаказ ко времени" })).toBeChecked();
  await expect(cart.getByRole("radio", { name: "Как можно скорее" })).toBeDisabled();
  const submit = cart.getByRole("button", { name: /^Заказать/ });
  await expect(submit).toBeDisabled();
  await cart.getByRole("combobox", { name: "Дата", exact: true }).selectOption({ index: 1 });
  await cart.getByRole("combobox", { name: "Время", exact: true }).selectOption("12:00");
  await expect(submit).toBeEnabled();
});
test("enabled preorder with no usable times is not advertised", async ({ page }) => {
  settings.preOrder = { enabled: true, slots: ["00:00"], daysAhead: 0, minAheadMinutes: 1440 }; await save();
  await page.goto("/");
  await expect(page.getByTestId("order-availability-notice")).toHaveText(CLOSED_WITHOUT_SLOTS);
  const cart = await checkout(page);
  await cart.getByRole("button", { name: "Самовывоз", exact: true }).click();
  await expect(cart.getByRole("status")).toHaveText(CLOSED_WITHOUT_SLOTS);
  await expect(cart.getByRole("radio", { name: "Предзаказ ко времени" })).toHaveCount(0);
});
test("scheduled delivery offers actual windows without enabling generic preorder", async ({ page }) => {
  settings.delivery.pickupEnabled = false; await save(); await option("scheduled");
  await page.goto("/");
  await expect(page.getByTestId("order-availability-notice")).toHaveText(CLOSED_WITH_SLOTS);
  const cart = await checkout(page);
  await expect(cart.getByRole("status")).toHaveCount(0);
  await expect(cart.getByRole("combobox", { name: "Дата", exact: true })).toBeVisible();
  await expect(cart.getByRole("combobox", { name: "Интервал", exact: true })).toBeVisible();
  await expect(cart.getByRole("button", { name: /^Заказать/ })).toBeDisabled();
});
test("disabled delivery options cannot activate generic delivery preorder or disabled pickup", async ({ page }) => {
  settings.delivery.pickupEnabled = false;
  settings.preOrder = { enabled: true, slots: ["12:00"], daysAhead: 1, minAheadMinutes: 30 }; await save(); await option("asap",false);
  await page.goto("/");
  await expect(page.getByTestId("order-availability-notice")).toHaveText(CLOSED_WITHOUT_SLOTS);
  const cart = await checkout(page);
  await expect(cart.getByRole("button", { name: "Самовывоз", exact: true })).toHaveCount(0);
  await expect(cart.getByRole("button", { name: "Доставка", exact: true })).toHaveClass(/bg-accent/);
  await expect(cart.getByRole("radio", { name: "Предзаказ ко времени" })).toHaveCount(0);
  await expect(cart.getByText("Сейчас доставка недоступна.", { exact: true })).toBeVisible();
  await expect(cart.getByRole("button", { name: /^Заказать/ })).toBeDisabled();
});
test("disabled pickup and delivery cannot expose preorder controls", async ({ page }) => {
  settings.delivery.enabled = false; settings.delivery.pickupEnabled = false;
  settings.preOrder = { enabled: true, slots: ["12:00"], daysAhead: 1, minAheadMinutes: 30 }; await save();
  await page.goto("/");
  await expect(page.getByTestId("order-availability-notice")).toHaveText(CLOSED_WITHOUT_SLOTS);
  const cart = await checkout(page);
  await expect(cart.getByRole("radio", { name: "Предзаказ ко времени" })).toHaveCount(0);
  await expect(cart.getByRole("status")).toHaveText(CLOSED_WITHOUT_SLOTS);
  await expect(cart.getByRole("button", { name: /^Заказать/ })).toBeDisabled();
});
test("unavailable network cannot substitute a preorder or enable checkout", async ({ page }) => {
  await page.route("**/api/delivery/slots", route => route.abort());
  await page.goto("/");
  const cart = await checkout(page);
  await expect(cart.getByRole("alert")).toHaveText("Не удалось проверить доступность заказа. Закройте корзину и попробуйте снова.");
  await expect(cart.getByRole("radio", { name: "Предзаказ ко времени" })).toHaveCount(0);
  await expect(cart.getByRole("button", { name: /^Заказать/ })).toBeDisabled();
});
test("open storefront has no closed message, reopening removes it on reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("order-availability-notice")).toHaveText(CLOSED_WITHOUT_SLOTS);
  await schedule(true); await page.reload();
  await expect(page.getByTestId("order-availability-notice")).toHaveCount(0);
  expect((await (await page.request.get("/api/delivery/slots")).json()).asapAvailable).toBe(true);
});
test("closed notice and both menu rows stay below the header at 100% and 125% font size", async ({ page }) => {
  await page.goto("/menu");
  const notice = page.getByTestId("order-availability-notice");
  await expect(notice).toBeVisible();
  await page.locator('section[id^="cat-"]').last().evaluate(el => { (el as HTMLElement).style.paddingBottom = "1200px"; });
  for (const fontSize of ["16px","20px"]) {
    await page.evaluate(size => { document.documentElement.style.fontSize = size; window.scrollTo(0, 400); },fontSize);
    await expect.poll(async () => {
      const a = await page.locator("[data-site-header]").boundingBox();
      const b = await notice.boundingBox();
      const c = await page.getByTestId("menu-switch").boundingBox();
      const d = await page.getByTestId("menu-tabs").boundingBox();
      return !!a && !!b && !!c && !!d && b.y >= a.y+a.height-1 && c.y >= b.y+b.height-1 && d.y >= c.y+c.height-1;
    }).toBe(true);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    const target = page.getByTestId("menu-tabs").getByRole("tab").nth(1);
    const name = await target.innerText(); await target.click();
    await expect.poll(async () => {
      const a = await page.getByRole("heading", { name, exact: true }).boundingBox();
      const b = await page.getByTestId("menu-navigation").boundingBox();
      return !!a && !!b && a.y >= b.y+b.height-1;
    }).toBe(true);
  }
});
