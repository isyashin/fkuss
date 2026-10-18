import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

test.use({ extraHTTPHeaders: { "x-forwarded-for": "10.99.251.42" } });

test("private storefront, account and address preview never enter the service-worker cache", async ({ page, context, browserName }) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const suffix = randomUUID();
  const email = `sw-private-${suffix}@example.test`;
  const street = `QA-private-street-${suffix}`;
  try {
    const login = await page.request.post("/api/auth/dev-login", { data: { email } });
    expect(login.status()).toBe(200);
    const customer = await pool.query<{ id: string }>('SELECT id FROM "Customer" WHERE email=$1', [email]);
    await pool.query('INSERT INTO "Address" (id,"customerId",street) VALUES ($1,$2,$3)', [`sw-address-${suffix}`, customer.rows[0].id, street]);
    const response = await page.goto("/");
    expect(response!.headers()["x-fkuss-cache"]).toBe("private");
    expect(await response!.text()).toContain(street);
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    await page.reload();
    const account = await page.goto("/account");
    expect(await account!.text()).toContain(email);
    await page.evaluate(async () => { await (await fetch("/api/delivery/zone?address=QA-private-address&total=100")).text(); });
    const cached = await page.evaluate(async () => {
      const requests = await Promise.all((await caches.keys()).map(async (name) => (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname)));
      return requests.flat();
    });
    expect(cached.filter((p) => p === "/" || p.startsWith("/account") || p.startsWith("/api/delivery/zone"))).toEqual([]);
    await page.request.post("/api/auth/logout");
    await page.goto("/");
    expect(await page.content()).not.toContain(street);
    // WebKit's Playwright offline reload is unstable (same limitation as SW-02).
    // Cache absence above is still checked in every browser.
    if (browserName !== "webkit") {
      await context.setOffline(true);
      await expect(page.goto("/account")).rejects.toThrow(/ERR_INTERNET_DISCONNECTED|ERR_FAILED/);
    }
  } finally {
    await context.setOffline(false);
    await pool.query('DELETE FROM "Address" WHERE id=$1', [`sw-address-${suffix}`]);
    await pool.query('DELETE FROM "Session" WHERE "customerId" IN (SELECT id FROM "Customer" WHERE email=$1)', [email]);
    await pool.query('DELETE FROM "Customer" WHERE email=$1', [email]);
    await pool.end();
  }
});

test("receipt number alone reveals no WhatsApp personal data; checkout proof is cleared on logout", async ({ page, browser }) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const name = `SW-receipt-${randomUUID()}`;
  const previous = await pool.query<{ value: { channels: { whatsapp: unknown } } }>('SELECT value FROM "Settings" WHERE key=\'settings\'');
  let orderId: string | undefined;
  try {
    await pool.query('UPDATE "Settings" SET value=jsonb_set(value,\'{channels,whatsapp}\',$1::jsonb) WHERE key=\'settings\'', [JSON.stringify({ enabled: true, phone: "+79991112233" })]);
    const dish = await pool.query<{ id: string }>('SELECT d.id FROM "Dish" d WHERE d.available AND d.price>0 AND NOT EXISTS(SELECT 1 FROM "ModifierGroup" g WHERE g."dishId"=d.id AND g."minSelected">0) ORDER BY d.id LIMIT 1');
    const created = await page.request.post("/api/order", { data: { type: "pickup", customerName: name, customerPhone: "+79990001819", items: [{ dishId: dish.rows[0].id, quantity: 1 }] } });
    expect(created.status()).toBe(200);
    const result: { orderNumber: number } = await created.json();
    const row = await pool.query<{ id: string }>('SELECT id FROM "Order" WHERE number=$1 AND "customerName"=$2', [result.orderNumber, name]);
    orderId = row.rows[0].id;
    await page.goto(`/order/success?n=${result.orderNumber}`);
    const url = page.url();
    const duplicate = page.getByRole("link", { name: "Дублировать заказ в WhatsApp", exact: true });
    await expect(duplicate).toBeVisible();
    expect(new URL((await duplicate.getAttribute("href"))!).searchParams.get("text")).toContain(name);
    const other = await browser.newContext();
    try {
      const observer = await other.newPage();
      await observer.goto(url);
      await expect(observer.getByRole("link", { name: "Дублировать заказ в WhatsApp", exact: true })).toHaveCount(0);
      expect(await observer.content()).not.toContain(encodeURIComponent(name));
    } finally { await other.close(); }
    const cookie = (await page.context().cookies(url)).find((c) => c.name === "resto_order_confirmation");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.path).toBe("/order/success");
    await page.request.post("/api/auth/logout");
    expect((await page.context().cookies(url)).some((c) => c.name === "resto_order_confirmation")).toBe(false);
    await page.reload();
    await expect(duplicate).toHaveCount(0);
  } finally {
    if (orderId) {
      await pool.query('DELETE FROM "AdminEvent" WHERE kind=\'order\' AND reference=$1', [orderId]);
      await pool.query('DELETE FROM "BonusTransaction" WHERE "orderId"=$1', [orderId]);
      await pool.query('DELETE FROM "OrderItem" WHERE "orderId"=$1', [orderId]);
      await pool.query('DELETE FROM "Order" WHERE id=$1', [orderId]);
    }
    await pool.query('UPDATE "Settings" SET value=jsonb_set(value,\'{channels,whatsapp}\',$1::jsonb) WHERE key=\'settings\'', [JSON.stringify(previous.rows[0].value.channels.whatsapp)]);
    await pool.end();
  }
});
