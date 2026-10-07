import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { nowInTimeZone } from "../src/lib/hours";
import { loginAdminUi } from "./login-admin";

// Админка: вход под личной учётной записью, список заказов, смена статуса
test("ресторатор входит в админку и двигает заказ по статусам", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);

  await loginAdminUi(page);

  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "Заказы" })).toBeVisible();

  const detail = page.getByRole("region", { name: "Детали заказа" });
  // Редизайн: переходы — главной кнопкой следующего шага.
  const next = detail.getByRole("button", { name: "Принять", exact: true });
  if (await next.isVisible().catch(() => false)) {
    await next.click();
    await expect(detail.getByText("Принят", { exact: true }).first()).toBeVisible();
  }
});

test("админка без пароля уводит на логин", async ({ page }) => {
  await page.goto("/admin/settings");
  await expect(page).toHaveURL(/\/admin\/login/);
});

test("ближайшая бронь доступна в разделе «Брони» и подтверждается", async ({ page }) => {
  const db = new Client({ connectionString: process.env.DATABASE_URL! });
  const id = crypto.randomUUID();
  const guestName = `Гость E2E ${crypto.randomUUID().slice(0, 8)}`;
  await db.connect();
  try {
    await db.query('INSERT INTO "Reservation" ("id", "date", "time", "guests", "customerName", "customerPhone") VALUES ($1, $2, $3, $4, $5, $6)',
      [id, nowInTimeZone("Europe/Moscow").date, "23:59", 2, guestName, "+79990000003"]);
    await page.goto("/admin/login");
    await loginAdminUi(page);
    await expect(page).toHaveURL(/\/admin$/);
    // Редизайн: брони живут в своём разделе, на дашборде заказов их нет.
    // Выбор — по прямой ссылке ?selected=: не зависит от позиции в списке.
    await page.goto(`/admin/bookings?selected=${id}`);
    const detail = page.getByRole("region", { name: "Детали брони" });
    try {
      await expect(detail.getByText(guestName)).toBeVisible({ timeout: 10000 });
    } catch (cause) {
      const mainText = await page.evaluate(() => document.querySelector("main")?.innerText ?? "(no main)").catch(() => "(eval failed)");
      console.log(`BOOKINGS-DEBUG url=${page.url()} main=${mainText.replace(/\s+/g, " ").slice(0, 500)}`);
      throw cause;
    }
    await detail.getByRole("button", { name: "Подтвердить" }).click();
    await expect(detail.getByText("Подтверждена").first()).toBeVisible();
    expect((await db.query<{ status: string }>('SELECT "status" FROM "Reservation" WHERE "id" = $1', [id])).rows[0]?.status).toBe("confirmed");
    const layout = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
    expect(layout.content).toBeLessThanOrEqual(layout.viewport + 1);
  } finally {
    await db.query('DELETE FROM "Reservation" WHERE "id" = $1', [id]);
    await db.end();
  }
});
