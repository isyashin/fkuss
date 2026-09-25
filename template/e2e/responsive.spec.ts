import { test, expect, type Page } from "@playwright/test";
import { loginAdminUi } from "./login-admin";

async function assertResponsivePage(page: Page, path: string) {
  const brokenAssets: string[] = [];
  const onResponse = (response: { url: () => string; status: () => number }) => {
    const pathname = new URL(response.url()).pathname;
    if (pathname.startsWith("/content-asset/") && response.status() >= 400) {
      brokenAssets.push(`${response.status()} ${pathname}`);
    }
  };

  page.on("response", onResponse);
  try {
    await page.goto(path);
    await expect.poll(() => page.evaluate(() => document.readyState)).toBe("complete");
    const layout = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
      controls: [...document.querySelectorAll("button, input:not([type='hidden']), select, textarea")]
        .filter((element) => {
          const style = getComputedStyle(element);
          return style.display !== "none" && style.visibility !== "hidden";
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { width: rect.width, height: rect.height, kind: `${element.tagName.toLowerCase()}.${String(element.className)}` };
        })
        .filter((element) => element.width > 0 && element.height > 0),
      touchLinks: [...document.querySelectorAll('a[href]')]
        .filter((element) => {
          const style = getComputedStyle(element);
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            /min-h-(?:11|12|\[44px\])/.test(element.className)
          );
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { width: rect.width, height: rect.height, kind: `${element.tagName.toLowerCase()}.${String(element.className)}` };
        })
        .filter((element) => element.width > 0 && element.height > 0),
    }));
    expect(layout.content, `${path} has horizontal overflow`).toBeLessThanOrEqual(layout.viewport + 1);
    for (const control of layout.controls) {
      expect(control.width, `${path} ${control.kind} control is narrower than 44px`).toBeGreaterThanOrEqual(44);
      expect(control.height, `${path} ${control.kind} control is shorter than 44px`).toBeGreaterThanOrEqual(44);
    }
    for (const link of layout.touchLinks) {
      expect(link.width, `${path} ${link.kind} touch link is narrower than 44px`).toBeGreaterThanOrEqual(44);
      expect(link.height, `${path} ${link.kind} touch link is shorter than 44px`).toBeGreaterThanOrEqual(44);
    }
    expect(brokenAssets, `${path} has broken content assets`).toEqual([]);
  } finally {
    page.off("response", onResponse);
  }
}

test("public pages fit the viewport and content assets load", async ({ page }) => {
  for (const path of ["/", "/booking", "/account"]) {
    await assertResponsivePage(page, path);
  }
});

test("admin login and dashboard fit the viewport", async ({ page }) => {
  await assertResponsivePage(page, "/admin/login");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);
  await assertResponsivePage(page, "/admin");
});

test("admin orders use two readable columns with bookings below at 1280px", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/admin/login");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);

  const orders = await page.getByRole("region", { name: "Список заказов" }).boundingBox();
  const detail = await page.getByRole("region", { name: "Детали заказа" }).boundingBox();
  const bookings = await page.getByRole("region", { name: "Ближайшие брони" }).boundingBox();
  expect(orders).not.toBeNull();
  expect(detail).not.toBeNull();
  expect(bookings).not.toBeNull();
  expect(orders!.width).toBeGreaterThan(430);
  expect(detail!.width).toBeGreaterThan(400);
  expect(detail!.x).toBeGreaterThan(orders!.x + orders!.width);
  expect(bookings!.y).toBeGreaterThanOrEqual(Math.max(orders!.y + orders!.height, detail!.y + detail!.height) - 1);
  expect(bookings!.x).toBeCloseTo(orders!.x, 0);

  await page.setViewportSize({ width: 960, height: 900 });
  const width = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  expect(width.content, "admin orders overflow near the two-column breakpoint").toBeLessThanOrEqual(width.viewport + 1);
});
