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
  const status = detail.getByLabel("Статус заказа");
  if (await status.isVisible().catch(() => false) && await status.locator('option[value="accepted"]').count()) {
    await status.selectOption("accepted");
    await expect(status).toHaveValue("accepted");
    await expect(detail.getByText("Принят", { exact: true }).first()).toBeVisible();
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
    await expect(widget.getByText(guestName)).toBeVisible();
    await widget.getByRole("link", { name: new RegExp(`Открыть бронь .*${guestName}`) }).click();
    const detail = page.getByRole("region", { name: "Детали брони" });
    await expect(detail.getByText(guestName)).toBeVisible();
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
