import { expect, test, type Page } from "@playwright/test";
import { Pool } from "pg";
import { gotoAdmin, loginAdminUi } from "./login-admin";

async function adminLogin(page: Page) {
  await gotoAdmin(page, "/admin/login");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);
}

async function textContrast(page: Page, surface: string, text: string): Promise<number> {
  return page.evaluate(({ surface, text }) => {
    const background = document.querySelector(surface);
    const foreground = document.querySelector(text);
    if (!background || !foreground) throw new Error(`Missing contrast pair: ${surface} / ${text}`);
    const rgb = (value: string) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const luminance = (value: string) => {
      const [r, g, b] = rgb(value).map((v) => {
        const s = v / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const a = luminance(getComputedStyle(background).backgroundColor);
    const b = luminance(getComputedStyle(foreground).color);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }, { surface, text });
}

test("mobile dark theme keeps orders, bookings, menu and settings readable", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "mobile-only regression");
  test.setTimeout(120_000);
  const order = await page.request.post("/api/order", {
    headers: { "x-forwarded-for": `10.99.74.${testInfo.project.name === "webkit-mobile" ? 2 : 1}` },
    data: {
      items: [{ dishId: "khachapuri-adjarski", quantity: 1, modifierIds: [] }],
      type: "pickup", customerName: "E2E Dark Mobile", customerPhone: "+79990000006", website: "",
    },
  });
  expect(order.ok()).toBe(true);
  const { orderNumber } = await order.json() as { orderNumber: number };
  await adminLogin(page);
  await page.getByRole("button", { name: /Профиль:/ }).click();
  await page.getByRole("button", { name: "☾ Тёмная тема" }).click();
  await gotoAdmin(page, `/admin?q=${orderNumber}`);
  const card = page.locator("article[class*='orderMobileCard']").first();
  await expect(card).toBeVisible();
  expect(await textContrast(page, "section[aria-label='Список заказов']", "section[aria-label='Список заказов'] h1")).toBeGreaterThanOrEqual(4.5);
  expect(await textContrast(page, "article[class*='orderMobileCard']", "article[class*='orderMobileCard'] strong")).toBeGreaterThanOrEqual(4.5);
  await card.locator("button[class*='orderCardOpen']").click();
  const detail = page.getByRole("region", { name: "Детали заказа" });
  await expect(detail).toBeVisible();
  expect(await textContrast(page, "section[aria-label='Детали заказа']", "section[aria-label='Детали заказа'] [class*='orderMobileSummary'] strong")).toBeGreaterThanOrEqual(4.5);
  expect(await textContrast(page, "section[aria-label='Детали заказа']", "section[aria-label='Детали заказа'] [class*='lineItem'] strong")).toBeGreaterThanOrEqual(4.5);

  await gotoAdmin(page, "/admin/bookings");
  expect(await textContrast(page, "section[aria-label='Список броней']", "section[aria-label='Список броней'] h1")).toBeGreaterThanOrEqual(4.5);
  await gotoAdmin(page, "/admin/menu");
  expect(await textContrast(page, "section[aria-label='Список блюд']", "section[aria-label='Список блюд'] h1")).toBeGreaterThanOrEqual(4.5);
  await gotoAdmin(page, "/admin/settings?section=preorder");
  expect(await textContrast(page, "select[class*='pickerSelect']", "select[class*='pickerSelect']")).toBeGreaterThanOrEqual(4.5);
});

test("mobile preorder save persists an absolute date and structured snapshot", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "mobile-only regression");
  test.setTimeout(150_000);
  await adminLogin(page);
  await gotoAdmin(page, "/admin/settings?section=preorder");
  const enabled = page.getByRole("checkbox", { name: "Предзаказ ко времени включён" });
  const days = page.getByLabel("На сколько суток вперёд предлагать слоты");
  const originalEnabled = await enabled.isChecked();
  const originalDays = await days.inputValue();
  const alreadyHasSlot = await page.getByRole("button", { name: "Удалить слот 23:59" }).count() > 0;
  try {
    if (!originalEnabled) await enabled.check();
    await days.fill(originalDays === "1" ? "2" : "1");
    if (!alreadyHasSlot) {
      await page.getByLabel("Новый слот").fill("23:59");
      await page.getByRole("button", { name: "+", exact: true }).click();
    }
    const save = page.getByRole("button", { name: "Сохранить", exact: true });
    await expect(save).toBeVisible();
    await save.click();
    await expect(page.getByRole("status").getByText("Сохранено")).toBeVisible();
    await page.reload();
    await expect(enabled).toBeChecked();
    await expect(page.getByRole("button", { name: "Удалить слот 23:59" })).toBeVisible();

    const slotsResponse = await page.request.get("/api/delivery/slots");
    expect(slotsResponse.ok()).toBe(true);
    const slots = await slotsResponse.json() as { preOrder: { slots: { date: string; time: string }[] } };
    const slot = slots.preOrder.slots.filter((s) => s.time === "23:59").at(-1);
    expect(slot).toBeDefined();
    const response = await page.request.post("/api/order", {
      headers: { "x-forwarded-for": `10.99.75.${testInfo.project.name === "webkit-mobile" ? 2 : 1}` },
      data: {
        items: [{ dishId: "khachapuri-adjarski", quantity: 1, modifierIds: [] }],
        type: "pickup", customerName: "E2E Absolute Preorder", customerPhone: "+79990000007",
        preOrderDate: slot!.date, preOrderTime: slot!.time, website: "",
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
    const { orderNumber } = await response.json() as { orderNumber: number };
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      const result = await pool.query<{ preOrderDate: string; preOrderTime: string; preOrderTz: string; desiredTime: string }>(
        'SELECT "preOrderDate", "preOrderTime", "preOrderTz", "desiredTime" FROM "Order" WHERE number=$1', [orderNumber],
      );
      expect(result.rows[0]).toEqual({
        preOrderDate: slot!.date, preOrderTime: "23:59", preOrderTz: expect.any(String),
        desiredTime: `${slot!.date.slice(8, 10)}.${slot!.date.slice(5, 7)}.${slot!.date.slice(0, 4)}, 23:59`,
      });
    } finally { await pool.end(); }
    await gotoAdmin(page, `/admin?q=${orderNumber}`);
    const card = page.locator("article[class*='orderMobileCard']").first();
    await expect(card).toContainText(slot!.date.slice(0, 4));
  } finally {
    await gotoAdmin(page, "/admin/settings?section=preorder").catch(() => {});
    if (!alreadyHasSlot) await page.getByRole("button", { name: "Удалить слот 23:59" }).click().catch(() => {});
    await days.fill(originalDays).catch(() => {});
    if (!originalEnabled) await enabled.uncheck().catch(() => {});
    const restore = page.getByRole("button", { name: "Сохранить", exact: true });
    if (await restore.isVisible().catch(() => false)) await restore.click().catch(() => {});
  }
});

test("mobile section picker is the only visible heading for each settings section", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "mobile-only regression");
  test.setTimeout(180_000);
  await adminLogin(page);
  for (const section of [
    "restaurant", "hours", "theme", "pages", "gallery", "promos", "banquets", "print", "delivery", "preorder",
    "payment", "booking", "pricing", "sync", "guest-contact", "notify", "cabinet", "sound", "team", "billing",
  ]) {
    await gotoAdmin(page, `/admin/settings?section=${section}`);
    await expect(page.getByLabel("Раздел настроек")).toHaveValue(section);
    const title = await page.evaluate(() => {
      const editor = document.querySelector('[class*="settings-redesign_editor__"]');
      const h2 = editor?.querySelector("h2");
      return h2 ? { text: h2.textContent, clipped: getComputedStyle(h2).clipPath === "inset(50%)" } : null;
    });
    expect(title, `${section}: section heading exists for accessibility`).not.toBeNull();
    expect(title!.clipped, `${section}: repeated heading should be visually hidden`).toBe(true);
  }
});
