import { test, expect } from "@playwright/test";

test("PWA-01/03: манифест отдаёт иконки ресторана с версией, fallback при отсутствии логотипа", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
  for (const icon of manifest.icons) {
    expect(icon.src).toContain("/content-asset/icons/");
    expect(icon.src).toContain("?v=");
    const response = await request.get(icon.src);
    expect(response.ok()).toBe(true);
    expect((await response.body()).byteLength).toBeGreaterThan(500);
  }
});

test("PWA-04: установленное приложение — кнопка скрыта", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "matchMedia", {
      value: (query: string) => ({
        matches: query.includes("standalone"),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    });
  });
  await page.goto("/");
  await expect(page.getByText("Установить приложение")).toHaveCount(0);
});

test("PWA-06: офлайн — понятная плашка", async ({ page, context }) => {
  await page.goto("/");
  await context.setOffline(true);
  await expect(page.getByText(/Нет подключения к сети/)).toBeVisible({ timeout: 15000 });
  await context.setOffline(false);
});
