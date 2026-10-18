import { expect, test } from "@playwright/test";
import { gotoAdmin, loginAdminUi } from "./login-admin";

test("QA18R-02: dish weight and price controls keep their height and desktop alignment", async ({ page }) => {
  await gotoAdmin(page, "/admin/login");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);
  await gotoAdmin(page, "/admin/menu");
  await page.getByRole("button", { name: /Открыть блюдо/ }).first().click();
  const editor = page.getByRole("region", { name: "Выбранное блюдо" });
  for (const width of [360, 390, 901, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const weight = editor.getByRole("textbox", { name: /^Вес \/ объём/ });
    const mode = editor.getByRole("combobox", { name: "Режим цены", exact: true });
    await mode.scrollIntoViewIfNeeded();
    const input = await weight.boundingBox();
    const select = await mode.boundingBox();
    expect(input!.height).toBeGreaterThanOrEqual(44);
    expect(select!.height).toBeGreaterThanOrEqual(44);
    expect(Math.abs(input!.height - select!.height), `height at ${width}`).toBeLessThanOrEqual(1);
    if (width > 900) expect(Math.abs(input!.y - select!.y), `top at ${width}`).toBeLessThanOrEqual(1);
    expect(select!.x + select!.width).toBeLessThanOrEqual(width + 1);
  }
});
