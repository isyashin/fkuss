import { expect, test } from "@playwright/test";
import { Pool } from "pg";
// The guest SW handles fetch before page.route; this test owns the transport.
test.use({ serviceWorkers: "block" });

test("delivery is unknown until address resolution, then distinguishes paid, free and blocked", async ({ page }) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const original = (await pool.query('SELECT value FROM "Settings" WHERE key=\'settings\'')).rows[0].value;
  const changed = { ...original, delivery: { ...original.delivery, enabled: true, minOrder: 0,
    geo: { enabled: true, outside: "block", outsidePrice: 0 },
    zones: [{ name: "QA", enabled: true, deliveryMinutes: 60, tariffs: [{ from: 0, price: 300 }], polygon: [[55, 37], [56, 37], [56, 38]] }],
  } };
  try {
    await pool.query('UPDATE "Settings" SET value=$1::jsonb WHERE key=\'settings\'', [JSON.stringify(changed)]);
    await page.route("**/api/delivery/slots", (route) => route.fulfill({ json: { options: [], asapAvailable: true, preOrder: { enabled: false, slots: [] } } }));
    let response: object = { kind: "zone", zoneName: "QA", tariffs: [{ from: 0, price: 300 }], deliveryMinutes: 60, lat: 55.5, lng: 37.5 };
    await page.route("**/api/delivery/zone?*", (route) => route.fulfill({ json: response }));
    await page.goto("/");
    await page.getByRole("button", { name: /Хачапури по-аджарски/ }).click();
    await page.getByRole("button", { name: /Добавить ·/ }).click();
    await page.getByRole("button", { name: /Корзина · 1/ }).click();
    await page.getByRole("button", { name: /Оформить ·/ }).click();
    const cart = page.getByRole("dialog");
    await expect(cart.getByText("Рассчитаем по адресу", { exact: true })).toBeVisible();
    await expect(cart.getByText("Без доставки", { exact: true })).toBeVisible();
    await expect(cart.getByText("бесплатно", { exact: true })).toHaveCount(0);
    await expect(cart.getByRole("button", { name: "Заказать", exact: true })).toBeDisabled();
    await cart.getByLabel("Город").fill("Москва");
    await cart.getByLabel("Улица").fill("Тестовая");
    await cart.getByLabel("Дом", { exact: true }).fill("1");
    await expect(cart.getByText("300 ₽", { exact: true }).last()).toBeVisible();
    await expect(cart.getByText("Итого", { exact: true })).toBeVisible();
    response = { kind: "zone", zoneName: "QA", tariffs: [{ from: 0, price: 0 }], deliveryMinutes: 60, lat: 55.5, lng: 37.5 };
    await cart.getByLabel("Дом", { exact: true }).fill("2");
    await expect(cart.getByText("бесплатно", { exact: true }).last()).toBeVisible();
    response = { kind: "outside-blocked", lat: 1, lng: 1 };
    await cart.getByLabel("Дом", { exact: true }).fill("3");
    await expect(cart.getByText("Адрес вне зоны", { exact: true })).toBeVisible();
    await expect(cart.getByText("бесплатно", { exact: true })).toHaveCount(0);
    await expect(cart.getByRole("button", { name: "Заказать", exact: true })).toBeDisabled();
  } finally {
    await pool.query('UPDATE "Settings" SET value=$1::jsonb WHERE key=\'settings\'', [JSON.stringify(original)]);
    await pool.end();
  }
});
