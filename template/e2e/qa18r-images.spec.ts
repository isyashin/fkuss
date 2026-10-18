import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

for (const imageCase of ["empty", "404"] as const) {
  test(`QA18R-01: ${imageCase} photo remains usable in menu, detail and cart`, async ({ page }) => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const categoryId = `qa18r-photo-${randomUUID()}`;
    const missingId = `${categoryId}-missing`;
    const validId = `${categoryId}-valid`;
    try {
      const valid = await pool.query<{ image: string }>('SELECT image FROM "Dish" WHERE available = true AND image <> \'\' ORDER BY id LIMIT 1');
      expect(valid.rows.length).toBe(1);
      await pool.query('INSERT INTO "Category" (id, name, position) VALUES ($1, $2, -1000)', [categoryId, "QA18R фотографии"]);
      await pool.query('INSERT INTO "Dish" (id, "categoryId", name, price, image, position, tags) VALUES ($1,$2,$3,100,$4,0,ARRAY[]::text[]),($5,$2,$6,100,$7,1,ARRAY[]::text[])', [missingId, categoryId, "QA18R блюдо без фото", imageCase === "empty" ? "" : `images/dishes/${categoryId}.webp`, validId, "QA18R блюдо с фото", valid.rows[0].image]);

      await page.goto("/menu");
      const missing = page.locator(`[data-dish-id="${missingId}"]`);
      const fallback = missing.getByRole("img", { name: "Фото отсутствует", exact: true });
      await expect(fallback).toBeVisible();
      await expect(missing.locator("img")).toHaveCount(0);
      await expect(page.locator('img[src=""], img:not([src])')).toHaveCount(0);
      const box = await missing.boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.x + box!.width).toBeLessThanOrEqual((page.viewportSize()?.width ?? 1280) + 1);
      await missing.click();
      let detail = page.getByRole("dialog");
      await expect(detail.getByRole("img", { name: "Фото отсутствует", exact: true })).toBeVisible();
      await expect(detail.locator("img")).toHaveCount(0);
      await detail.getByRole("button", { name: /Добавить ·/ }).click();
      await page.getByRole("button", { name: /Корзина · 1/ }).click();
      await expect(page.getByRole("dialog").getByRole("img", { name: "Фото отсутствует", exact: true })).toBeVisible();
      await expect(page.getByRole("dialog").locator("img")).toHaveCount(0);
      await page.getByRole("dialog").getByRole("button", { name: "Закрыть", exact: true }).last().click();

      // Opening another dish must not retain the previous image error.
      await page.locator(`[data-dish-id="${validId}"]`).click();
      detail = page.getByRole("dialog");
      await expect(detail.locator("img")).toBeVisible();
      await expect.poll(() => detail.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
      await expect(detail.getByRole("img", { name: "Фото отсутствует", exact: true })).toHaveCount(0);
      const layout = await page.evaluate(() => ({ width: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
      expect(layout.content).toBeLessThanOrEqual(layout.width + 1);
    } finally {
      await pool.query('DELETE FROM "Dish" WHERE id = ANY($1::text[])', [[missingId, validId]]);
      await pool.query('DELETE FROM "Category" WHERE id = $1', [categoryId]);
      await pool.end();
    }
  });
}
