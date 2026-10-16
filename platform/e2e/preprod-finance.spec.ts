import { expect, test } from "@playwright/test";

test("login cannot lose text entered before hydration", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/_next/static/chunks/*.js", async (route) => { await gate; await route.continue(); });
  try {
    await page.goto("/admin/login", { waitUntil: "commit" });
    const password = page.locator("input[type=password]");
    await expect(password).toBeDisabled();
    release();
    await expect(password).toBeEnabled();
    await password.fill(process.env.PLATFORM_ADMIN_PASSWORD ?? "platform-e2e-admin");
    await page.getByRole("button", { name: "Войти" }).click();
    await expect(page).toHaveURL(/\/admin$/);
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); }
});

test("invalid adjustment stays in the form without an error boundary", async ({ page }) => {
  await page.goto("/admin/login");
  await page.locator("input[type=password]").fill(process.env.PLATFORM_ADMIN_PASSWORD ?? "platform-e2e-admin");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/sites/buxara");
  const amount = page.getByLabel("Сумма корректировки");
  const comment = page.getByLabel("Комментарий", { exact: true });
  await amount.fill("1");
  await comment.fill("   ");
  await page.getByRole("button", { name: "Провести", exact: true }).click();
  await expect(page.locator("#adjust-comment-error")).toContainText("Укажите причину");
  await expect(amount).toHaveValue("1");
  await expect(comment).toHaveValue("   ");
  await amount.fill("999999999999");
  await comment.fill("E2E invalid range");
  await page.getByRole("button", { name: "Провести", exact: true }).click();
  await expect(page.locator("#adjust-amount-error")).toContainText("точностью до копейки");
  await expect(amount).toHaveValue("999999999999");
  await expect(page.getByRole("heading", { name: "Чайхана Бухара" })).toBeVisible();
});
