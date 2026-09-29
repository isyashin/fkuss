import { test, expect } from "@playwright/test";

// PIN владельца в карточке сайта платформы. В CI тенант-контейнера нет —
// сохранение должно дать честную ошибку сети, а не падать.
const PASSWORD = process.env.PLATFORM_ADMIN_PASSWORD ?? "platform-e2e-admin";

test("в карточке сайта есть PIN владельца с валидацией и обработкой сети", async ({ page }) => {
  await page.goto("/admin/login");
  await page.locator("input[type=password]").fill(PASSWORD);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole("link", { name: /Чайхана Бухара/ }).click();
  await expect(page).toHaveURL(/\/admin\/sites\/buxara$/);

  const section = page.getByRole("heading", { name: "PIN владельца" });
  await expect(section).toBeVisible();
  const pinInput = page.getByLabel("PIN владельца");
  await expect(pinInput).toBeVisible();

  // Невалидный PIN (меньше 4 цифр) не отправляется
  await pinInput.fill("12");
  await expect(page.getByRole("button", { name: "Сохранить PIN" })).toBeDisabled();

  // Валидный PIN уходит на сайт; без тенанта в CI — честная ошибка сети
  await pinInput.fill("4242");
  await page.getByRole("button", { name: "Сохранить PIN" }).click();
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 15000 });
});
