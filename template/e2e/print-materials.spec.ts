import { expect, test } from "@playwright/test";

test("ПМ-01: админ настраивает визитку и скачивает PNG", async ({ page }) => {
  await page.goto("/admin/login");
  await page.getByPlaceholder("Пароль").fill("admin");
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL(/\/admin$/);

  await page.goto("/admin/print-materials");
  await expect(page.getByRole("heading", { name: "Печатные материалы" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Визитка/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: /Магнит/ })).toBeVisible();
  await expect(page.getByRole("img", { name: /Предпросмотр/ })).toBeVisible();

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
