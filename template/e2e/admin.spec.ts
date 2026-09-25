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
  const accept = detail.getByRole("button", { name: "Принять" });
  if (await accept.isVisible().catch(() => false)) {
    await accept.click();
    await expect(detail.getByText("Принят", { exact: true })).toBeVisible();
  }
});

test("админка без пароля уводит на логин", async ({ page }) => {
  await page.goto("/admin/settings");
  await expect(page).toHaveURL(/\/admin\/login/);
});

test("ближайшая бронь доступна на общем экране и подтверждается", async ({ page }) => {
  const db = new Client({ connectionString: process.env.DATABASE_URL! });
  const id = crypto.randomUUID();
  const guestName = `Гость E2E ${crypto.randomUUID().slice(0, 8)}`;
  await db.connect();
  try {
    await db.query('INSERT INTO "Reservation" ("id", "date", "time", "guests", "customerName", "customerPhone") VALUES ($1, $2, $3, $4, $5, $6)',
      [id, nowInTimeZone("Europe/Moscow").date, "23:59", 2, guestName, "+79990000003"]);
    await page.goto("/admin/login");
    await loginAdminUi(page);
    const widget = page.getByRole("region", { name: "Ближайшие брони" });
    const row = widget.getByText(guestName).locator("xpath=../..");
    await expect(row.getByText("Новая")).toBeVisible();
    await row.getByRole("button", { name: "Подтвердить" }).click();
    await expect(row.getByText("Подтверждена")).toBeVisible();
    expect((await db.query<{ status: string }>('SELECT "status" FROM "Reservation" WHERE "id" = $1', [id])).rows[0]?.status).toBe("confirmed");
    const layout = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
    expect(layout.content).toBeLessThanOrEqual(layout.viewport + 1);
  } finally {
    await db.query('DELETE FROM "Reservation" WHERE "id" = $1', [id]);
    await db.end();
  }
});
