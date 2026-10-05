import { test, expect } from "@playwright/test";
import { loginAdminUi } from "./login-admin";

// Кабинет по умолчанию выключен; в E2E seed включает его (SEED_GUEST_CABINET=1).
// Спека проверяет гейты при выключении и возвращает состояние обратно.
test("выключенный кабинет: гейты на витрине и в API", async ({ page }) => {
  await page.goto("/admin/login");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);

  await page.request.patch("/api/admin/guest-cabinet", { data: { enabled: false } });
  try {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Кабинет" })).toHaveCount(0);

    await page.goto("/account");
    await expect(page.getByText("Личный кабинет сейчас отключён")).toBeVisible();

    const codeResp = await page.request.post("/api/auth/request-code", { data: { email: "guest-off@example.com" } });
    expect(codeResp.status()).toBe(403);

    const verifyResp = await page.request.post("/api/auth/verify", { data: { email: "guest-off@example.com", code: "123456" } });
    expect(verifyResp.status()).toBe(403);

    // Деньги: списание бонусов отклоняется сервером при выключенном кабинете
    await page.goto("/menu");
    const dishId = await page.getByTestId("dish-card").first().getAttribute("data-dish-id");
    const orderResp = await page.request.post("/api/order", {
      data: {
        items: [{ dishId, quantity: 1 }],
        type: "pickup",
        customerName: "Тест Гейта",
        customerPhone: "+79990001144",
        preferredChannel: "phone",
        bonusSpend: 100,
      },
    });
    expect(orderResp.status()).toBe(400);
    expect((await orderResp.json()).error).toMatch(/Бонусы недоступны/);
  } finally {
    await page.request.patch("/api/admin/guest-cabinet", { data: { enabled: true } });
  }

  // После повторного включения всё на месте
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Кабинет" })).toBeVisible();
  const codeResp = await page.request.post("/api/auth/request-code", { data: { email: "guest-on@example.com" } });
  expect(codeResp.ok()).toBe(true);
});

test("настройки кабинета: сохранение и чтение через API админки", async ({ page }) => {
  await page.goto("/admin/login");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);

  const patch = await page.request.patch("/api/admin/guest-cabinet", {
    data: { enabled: true, authMode: "email", smtpUrl: "smtps://u:p@mail:465", smtpFrom: "Ресторан <r@example.ru>" },
  });
  expect(patch.ok()).toBe(true);
  const get = await page.request.get("/api/admin/guest-cabinet");
  const data = await get.json();
  expect(data).toMatchObject({ enabled: true, authMode: "email", smtpUrl: "smtps://u:p@mail:465", smtpFrom: "Ресторан <r@example.ru>" });

  // вернули боевое состояние для остальных спек
  await page.request.patch("/api/admin/guest-cabinet", { data: { enabled: true, authMode: "screen", smtpUrl: "", smtpFrom: "" } });
});
