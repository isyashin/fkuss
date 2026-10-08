import { test, expect, type Page } from "@playwright/test";
import { loginAdminUi } from "./login-admin";

// router.refresh() админки прерывает goto (RSC-стриминг) — повторяем переход один раз.
async function gotoStable(page: Page, path: string) {
  await page.goto(path, { waitUntil: "commit" }).catch(async () => {
    await page.waitForLoadState("load").catch(() => {});
    await page.goto(path, { waitUntil: "commit" });
  });
  await page.waitForLoadState("networkidle").catch(() => {});
}

// Сотрудник: меню редактирует без ограничений, «Настройки» — через PIN владельца
// (экранная панель + клавиатура). PIN устанавливаем через site-key API тенанта.

const STAFF = { login: `e2e-staff-${Date.now().toString(36)}`, name: "Сотрудник E2E" };

async function createStaff(page: Page) {
  await page.goto("/admin/login");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);
  await gotoStable(page, "/admin/settings?section=team");
  const createForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Добавить сотрудника" }) });
  await createForm.getByLabel("Логин").fill(STAFF.login);
  await createForm.getByLabel("Имя").fill(STAFF.name);
  await createForm.getByLabel("Личный пароль").fill("staff-password-12");
  await page.getByRole("button", { name: "Добавить сотрудника" }).click();
  await expect(page.getByText(STAFF.login)).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: /Профиль/ }).click();
  await page.getByRole("button", { name: "Выйти" }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
}

async function loginStaff(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Логин").fill(STAFF.login);
  await page.getByLabel("Пароль").fill("staff-password-12");
  await page.getByRole("button", { name: "Войти" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

test("сотрудник: меню доступно, настройки открываются PIN с экранной панели", async ({ page }, testInfo) => {
  testInfo.setTimeout(180_000);

  // Тестовый PIN владельца на этом прогоне БД
  const pinResp = await page.request.post("/api/sites/owner-pin", {
    data: { pin: "12345" },
    headers: { "X-Site-Key": "e2e-test-site-key" },
  });
  if (!pinResp.ok()) console.log("owner-pin resp:", pinResp.status(), await pinResp.text());
  expect(pinResp.ok()).toBe(true);

  await createStaff(page);
  await loginStaff(page);

  // Навигация сотрудника: заказы, брони, меню, настройки
  await expect(page.getByRole("link", { name: "Меню" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Настройки" })).toBeVisible();

  // Меню редактируется: открываем первое блюдо, меняем вес и сохраняем
  await gotoStable(page, "/admin/menu");
  await expect(page.getByRole("heading", { name: "Меню" })).toBeVisible();
  await page.getByRole("button", { name: /Открыть блюдо/ }).first().click();
  const weightInput = page.getByLabel("Вес / объём");
  const original = await weightInput.inputValue();
  await weightInput.fill(original === "300 г" ? "301 г" : "300 г");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  // Сохранено: кнопка снова неактивна (на мобильном статус savebar скрыт по макету)
  await expect(page.getByRole("button", { name: "Сохранить", exact: true })).toBeDisabled({ timeout: 15000 });

  // Владельческий раздел по прямой ссылке — на экран PIN
  // (networkidle: не уходить со страницы посреди refresh после сохранения блюда)
  await page.waitForLoadState("networkidle").catch(() => {});
  await gotoStable(page, "/admin/team");
  await expect(page).toHaveURL(/\/admin\/settings\?pin=1$/);
  await expect(page.getByRole("heading", { name: "Введите PIN" })).toBeVisible();

  // Неверный PIN отклоняется
  for (const key of ["1", "1", "1", "1"]) await page.getByRole("button", { name: `Цифра ${key}` }).click();
  await page.getByRole("button", { name: "Разблокировать" }).click();
  await expect(page.locator("[class*='pinError']")).toContainText("Неверный PIN", { timeout: 15000 });

  // Верный PIN — кликами по визуальной панели (1-2-3-4-5) + кнопка подтверждения
  for (const key of ["1", "2", "3", "4", "5"]) await page.getByRole("button", { name: `Цифра ${key}` }).click();
  await page.getByRole("button", { name: "Разблокировать" }).click();
  // Редизайн: настройки открываются — контент владельца («Сотрудники») на месте
  await expect(page.getByRole("heading", { name: "Сотрудники" }).first()).toBeVisible({ timeout: 15000 });

  // Уровень владельца: «Сотрудники» открывается
  await gotoStable(page, "/admin/settings?section=team");
  await expect(page.getByRole("heading", { name: "Сотрудники" })).toBeVisible({ timeout: 15000 });

  // Загрузка фото сотрудником — только раздел dishes, остальные 403
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  );
  const forbidden = await page.request.post("/api/admin/upload", {
    multipart: {
      file: { name: "x.png", mimeType: "image/png", buffer: png },
      section: "background",
      name: "testbg",
    },
  });
  expect(forbidden.status()).toBe(403);
  const allowed = await page.request.post("/api/admin/upload", {
    multipart: {
      file: { name: "d.png", mimeType: "image/png", buffer: png },
      section: "dishes",
      name: "e2edish",
    },
  });
  expect(allowed.ok()).toBe(true);
});
