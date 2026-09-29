import { test, expect, type Page } from "@playwright/test";
import { loginAdminUi } from "./login-admin";

// Сотрудник: меню редактирует без ограничений, «Настройки» — через PIN владельца
// (экранная панель + клавиатура). PIN устанавливаем через site-key API тенанта.

const STAFF = { login: `e2e-staff-${Date.now().toString(36)}`, name: "Сотрудник E2E" };

async function createStaff(page: Page) {
  await page.goto("/admin/login");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto("/admin/team");
  await page.getByLabel("Логин").fill(STAFF.login);
  await page.getByLabel("Имя").fill(STAFF.name);
  await page.getByLabel("Личный пароль").fill("staff-password-12");
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
  expect(pinResp.ok()).toBe(true);

  await createStaff(page);
  await loginStaff(page);

  // Навигация сотрудника: заказы, брони, меню, настройки
  await expect(page.getByRole("link", { name: "Меню" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Настройки" })).toBeVisible();

  // Меню редактируется: меняем вес первого блюда и возвращаемся к списку
  await page.goto("/admin/menu");
  await expect(page.getByRole("heading", { name: "Меню" })).toBeVisible();
  const editButtons = page.getByRole("button", { name: "Править" });
  await editButtons.first().click();
  const weightInput = page.locator("label", { hasText: "Вес / объём" }).locator("input");
  const original = await weightInput.inputValue();
  await weightInput.fill(original === "300 г" ? "301 г" : "300 г");
  await page.getByRole("button", { name: "Сохранить" }).first().click();
  await expect(editButtons.first()).toBeVisible({ timeout: 15000 });

  // Владельческий раздел по прямой ссылке — на экран PIN
  await page.goto("/admin/team");
  await expect(page).toHaveURL(/\/admin\/settings\?pin=1$/);
  await expect(page.getByRole("heading", { name: "Введите PIN" })).toBeVisible();

  // Неверный PIN отклоняется
  for (const key of ["1", "1", "1", "1"]) await page.getByRole("button", { name: `Цифра ${key}` }).click();
  await page.getByRole("button", { name: "Разблокировать" }).click();
  await expect(page.getByRole("alert")).toContainText("Неверный PIN", { timeout: 15000 });

  // Верный PIN — кликами по визуальной панели (1-2-3-4-5) + кнопка подтверждения
  for (const key of ["1", "2", "3", "4", "5"]) await page.getByRole("button", { name: `Цифра ${key}` }).click();
  await page.getByRole("button", { name: "Разблокировать" }).click();
  await expect(page.getByRole("heading", { name: "Настройки" })).toBeVisible({ timeout: 15000 });

  // Уровень владельца: «Сотрудники» открывается
  await page.goto("/admin/team");
  await expect(page.getByRole("heading", { name: "Сотрудники" })).toBeVisible({ timeout: 15000 });

  // Загрузка фото сотрудником — только раздел dishes, остальные 403
  const png = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
      "0000000d49444154789c626001000000ffff03000006000557bfabd40000000049454e44ae426082",
    "hex",
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
