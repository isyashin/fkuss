import { expect, type Page } from "@playwright/test";

/** E2E запускается только с заранее созданной тестовой учётной записью. */
export async function loginAdminUi(page: Page): Promise<void> {
  const login = process.env.E2E_ADMIN_LOGIN;
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!login || !password) throw new Error("Для E2E нужны E2E_ADMIN_LOGIN и E2E_ADMIN_PASSWORD");
  await page.getByLabel("Логин").fill(login);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
}

/**
 * Переход в раздел админки с защитой от гонки с router.refresh() поллинга
 * событий (на webkit RSC-стриминг прерывал goto ошибкой
 * «interrupted by another navigation»). Готовность ждём опросом readyState.
 */
export async function gotoAdmin(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: "commit" }).catch(async () => {
    await page.waitForLoadState("load").catch(() => {});
    await page.goto(path, { waitUntil: "commit" });
  });
  await expect.poll(() => page.evaluate(() => document.readyState)).toBe("complete");
}
