import type { Page } from "@playwright/test";

/** E2E запускается только с заранее созданной тестовой учётной записью. */
export async function loginAdminUi(page: Page): Promise<void> {
  const login = process.env.E2E_ADMIN_LOGIN;
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!login || !password) throw new Error("Для E2E нужны E2E_ADMIN_LOGIN и E2E_ADMIN_PASSWORD");
  await page.getByLabel("Логин").fill(login);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
}
