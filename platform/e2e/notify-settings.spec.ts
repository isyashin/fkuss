import { test, expect } from "@playwright/test";

// Кабинет владельца: канал уведомлений сохраняется и переживает перезагрузку.
// Важно: email должен существовать в сиде (код не запрашивается для неизвестных).
test("владелец настраивает канал уведомлений о балансе", async ({ page }, testInfo) => {
  const email = testInfo.project.name === "mobile" ? "owner-mobile@buxara.test" : "owner-desktop@buxara.test";
  await page.goto("/cabinet");
  await page.getByPlaceholder("you@example.ru").fill(email);
  await page.getByRole("button", { name: "Получить код" }).click();
  const devText = await page.getByText(/DEV:/).textContent({ timeout: 15000 });
  const code = devText?.match(/(\d{6})/)?.[1];
  await page.locator('input[inputmode="numeric"]').fill(code!);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page.getByRole("heading", { name: "Мой сайт" })).toBeVisible({ timeout: 15000 });

  await expect(page.getByText("Уведомления о балансе")).toBeVisible();
  await page.getByLabel("Канал уведомлений").selectOption("telegram");
  await page.getByLabel("Telegram chat id").fill("123456789");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Сохранено ✓")).toBeVisible({ timeout: 15000 });

  await page.reload();
  await expect(page.getByRole("heading", { name: "Мой сайт" })).toBeVisible({ timeout: 15000 });
  await expect(page.getByLabel("Канал уведомлений")).toHaveValue("telegram");
  await expect(page.getByLabel("Telegram chat id")).toHaveValue("123456789");

  // Возвращаем email-канал, чтобы не портить остальные прогоны
  await page.getByLabel("Канал уведомлений").selectOption("email");
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Сохранено ✓")).toBeVisible({ timeout: 15000 });
});
