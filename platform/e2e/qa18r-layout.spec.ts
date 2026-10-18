import { expect, test } from "@playwright/test";

test("QA18R-03: platform back link has a 44px target and works at its lower edge and by keyboard", async ({ page }) => {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": "10.99.18.3" });
  await page.goto("/admin/login");
  await page.locator('input[type="password"]').fill(process.env.PLATFORM_ADMIN_PASSWORD ?? "platform-e2e-admin");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  for (const width of [360, 390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin/sites/buxara");
    const back = page.getByRole("link", { name: "← все сайты", exact: true });
    const box = await back.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await back.click({ position: { x: box!.width / 2, y: box!.height - 3 } });
    await expect(page).toHaveURL(/\/admin$/);
    await page.goto("/admin/sites/buxara");
    await back.focus();
    await expect(back).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/admin$/);
  }
});
