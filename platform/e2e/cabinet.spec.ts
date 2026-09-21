import { test, expect } from "@playwright/test";

// Кабинет владельца: вход по коду → пополнение (mock) → баланс обновлён
test("владелец входит и пополняет баланс", async ({ page }, testInfo) => {
  // Отдельный email на проект: коды привязаны к email, параллельные прогоны не мешают друг другу
  const email = `owner-${testInfo.project.name}@buxara.test`;
  await page.goto("/cabinet");
  await page.getByPlaceholder("you@example.ru").fill(email);
  await page.getByRole("button", { name: "Получить код" }).click();

  const devText = await page.getByText(/DEV:/).textContent({ timeout: 15000 });
  const code = devText?.match(/(\d{6})/)?.[1];
  expect(code).toBeTruthy();

  await page.locator('input[inputmode="numeric"]').fill(code!);
  await page.getByRole("button", { name: "Войти" }).click();

  await expect(page.getByRole("heading", { name: "Мой сайт" })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Чайхана Бухара")).toBeVisible();

  // Пополнение через mock-провайдер
  const balanceBefore = await page.locator("p.text-3xl").textContent();
  await page.locator('input[type="number"]').fill("1000");
  const mockNavigation = page.waitForRequest(
    (request) => new URL(request.url()).pathname === "/payment/mock",
    { timeout: 20_000 },
  );
  await page.getByRole("button", { name: "Пополнить" }).click();

  // Сначала ждём фактического перехода к mock-провайдеру. Иначе WebKit успевает
  // выполнить следующий page.goto ещё до ответа server action и отменяет оплату.
  await mockNavigation;
  await page.waitForURL("**/cabinet", { timeout: 20_000 });
  await page.waitForLoadState("networkidle").catch(() => {});

  const toNumber = (text: string | null) => Number(text?.replace(/[^\d.]/g, "")) || 0;
  const before = toNumber(balanceBefore);

  await expect
    .poll(
      async () => {
        await page.goto("/cabinet", { waitUntil: "domcontentloaded" }).catch(() => {});
        return toNumber(await page.locator("p.text-3xl").textContent().catch(() => null));
      },
      { timeout: 20000, intervals: [1000, 2000, 3000] },
    )
    .toBe(before + 1000);
});
