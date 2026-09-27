import { test, expect } from "@playwright/test";

// Админка платформы: вход → дашборд → карточка сайта → операции → экспорт → тёмная тема.
const PASSWORD = process.env.PLATFORM_ADMIN_PASSWORD ?? "platform-e2e-admin";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/admin/login");
  await page.locator("input[type=password]").fill(PASSWORD);
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("админ платформы: дашборд, карточка сайта, операции и экспорт", async ({ page }) => {
  await login(page);

  // Дашборд
  await expect(page.getByRole("heading", { name: "Сайты" })).toBeVisible();
  await expect(page.getByText("MRR · тарифы активных")).toBeVisible();
  await expect(page.getByText("3000.00 ₽").first()).toBeVisible();
  await expect(page.getByText("Чайхана Бухара")).toBeVisible();

  // Карточка сайта
  await page.getByRole("link", { name: /Чайхана Бухара/ }).click();
  await expect(page).toHaveURL(/\/admin\/sites\/buxara$/);
  await expect(page.getByRole("heading", { name: "Чайхана Бухара" })).toBeVisible();
  await expect(page.getByText("Операции с балансом")).toBeVisible();
  await expect(page.getByText("Счета и платежи")).toBeVisible();
  await expect(page.getByText("owner@buxara.test")).toBeVisible();

  // Ручная корректировка баланса
  await page.getByLabel("Сумма корректировки").fill("500");
  await page.getByLabel("Комментарий").fill("E2E корректировка");
  await page.getByRole("button", { name: "Провести" }).click();
  await expect(page.getByText("Ручная операция: E2E корректировка")).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("+500.00 ₽")).toBeVisible();

  // Запрос экспорта из карточки (перезагрузка после refresh — страховка от гонки рендера)
  await page.waitForLoadState("networkidle");
  await page.reload();
  const expBtn = page.getByRole("button", { name: /Запросить экспорт сайта|Подготовить новый архив/ });
  await expect(expBtn.first()).toBeVisible({ timeout: 15000 });
  await expBtn.first().click();
  await expect(page.getByText(/Экспорт запрошен/)).toBeVisible({ timeout: 15000 });
});

test("платформа: тёмная тема переключается и переживает перезагрузку", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Включить тёмную тему" }).click();
  await expect.poll(async () => page.locator(".pf-app").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(27, 30, 29)");
  await page.reload();
  await expect(page.getByRole("button", { name: "Включить светлую тему" })).toBeVisible();
  await expect(page.locator(".pf-app.pf-dark")).toHaveCount(1);
});
