import { expect, test } from "@playwright/test";
import { gotoAdmin, loginAdminUi } from "./login-admin";

test("profile waits for hydration even when WebKit exposes the SSR button", async ({ page }, testInfo) => {
  await gotoAdmin(page, "/admin/login");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/_next/static/chunks/*.js", async (route) => { await gate; await route.continue(); });
  try {
    await page.goto("/admin", { waitUntil: "commit" });
    // Before external CSS arrives both SSR shells can be visible. Own the viewport's shell.
    const profile = page.locator(`${testInfo.project.name === "desktop" ? "aside" : "header"} button[aria-label^='Профиль:']`);
    await expect(profile).toBeDisabled();
    release();
    await expect(profile).toBeEnabled();
    await profile.click();
    await expect(page.getByRole("button", { name: "☾ Тёмная тема" })).toBeVisible();
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); }
});

test("multiple import sources fit 360 and 390 px with 44 px delete controls", async ({ page }) => {
  await gotoAdmin(page, "/admin/login");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);
  await gotoAdmin(page, "/admin/settings?section=sync");
  for (let i = 0; i < 2; i++) await page.getByRole("button", { name: "+ Добавить источник" }).click();
  await page.getByLabel("placeSlug источника 1", { exact: true }).fill("very_long_restaurant_source_identifier_123456789");
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const rect = await page.getByRole("button", { name: "Удалить источник 1", exact: true }).boundingBox();
    expect(rect).not.toBeNull();
    expect(rect!.width).toBeGreaterThanOrEqual(44);
    expect(rect!.height).toBeGreaterThanOrEqual(44);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(width);
  }
});
