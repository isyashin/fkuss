import { expect, test } from "@playwright/test";
import { loginAdminUi } from "./login-admin";

test("ПМ-01: админ настраивает визитку и скачивает PNG", async ({ page }) => {
  await page.goto("/admin/login");
  await loginAdminUi(page);
  await page.waitForURL(/\/admin$/);

  await page.goto("/admin/print-materials");
  await expect(page.getByRole("heading", { name: "Печатные материалы" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Визитка/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: /Магнит/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /Предпросмотр/ })).toBeVisible();
  await expect(page.getByLabel(/Адрес сайта/)).toHaveAttribute("readonly", "");

  await page.getByRole("tab", { name: /Магнит/ }).click();
  await expect(page.getByRole("tab", { name: /Магнит/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("img", { name: /Магнит 70 × 70 мм/ })).toBeVisible();
  await page.getByRole("tab", { name: /Визитка/ }).click();

  const headline = page.getByLabel("Заголовок");
  const originalHeadline = await headline.inputValue();
  const changedHeadline = `Заказ прямо у нас ${Date.now().toString(36)}`;
  await headline.fill(changedHeadline);
  await page.getByRole("button", { name: "Сохранить макет" }).click();
  await expect(page.getByText("Настройки сохранены")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Заголовок")).toHaveValue(changedHeadline);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Скачать PNG/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/-card-90x50mm\.png$/);
  const stream = await download.createReadStream();
  let bytes = 0;
  for await (const chunk of stream) bytes += chunk.length;
  expect(bytes).toBeGreaterThan(10_000);

  // Возвращаем исходный текст, чтобы тест не менял состояние следующего прогона.
  await page.getByLabel("Заголовок").fill(originalHeadline);
  await page.getByRole("button", { name: "Сохранить макет" }).click();
  await expect(page.getByText("Настройки сохранены")).toBeVisible();
});
