import { test, expect } from "@playwright/test";
import { loginAdminUi } from "./login-admin";
import sharp from "sharp";

// Настоящий PNG, сгенерированный в тесте
async function makePng(): Promise<Buffer> {
  return sharp({
    create: {
      width: 800,
      height: 600,
      channels: 3,
      background: { r: 120, g: 80, b: 40 },
    },
  })
    .png()
    .toBuffer();
}

test("VIS-01/03: загрузка фона через админку, применение на витрине, удаление", async ({ page }) => {
  await page.goto("/admin/login");
  await loginAdminUi(page);
  await page.waitForURL(/\/admin$/);

  await page.goto("/admin/settings");
  await page.getByLabel("Фон включён").check();
  const appearance = page.locator("section#site-theme");
  const saveAppearance = async () => {
    await appearance.getByRole("button", { name: "Сохранить" }).click();
    await expect(appearance.getByRole("status")).toHaveText("Сохранено", { timeout: 15000 });
  };

  // Загрузка PNG
  const fileInput = appearance.locator('input[type="file"]');
  await fileInput.setInputFiles({ name: "bg-test.png", mimeType: "image/png", buffer: await makePng() });
  await expect(page.getByAltText("Фон — превью")).toBeVisible({ timeout: 15000 });

  await saveAppearance();

  // На мобильном проекте фон по умолчанию ВКЛЮЧЁН (disableOnMobile: false) —
  // флаг «Отключить на мобильных» выключаем, чтобы проверить применение
  const isMobile = test.info().project.name.includes("mobile");
  if (isMobile) {
    await page.goto("/admin/settings");
    await page.getByLabel("Отключить фон на мобильных").uncheck();
    await saveAppearance();
  }

  // На витрине — background-image в стилях body (ждём применения)
  await page.goto("/");
  await expect
    .poll(async () => page.evaluate(() => getComputedStyle(document.body).backgroundImage), { timeout: 15000 })
    .toContain("content-asset");

  // Удаление
  await page.goto("/admin/settings");
  await appearance.getByRole("button", { name: "Удалить" }).click({ force: true });
  await saveAppearance();

  await page.getByLabel("Фон включён").uncheck();
  if (isMobile) {
    await page.getByLabel("Отключить фон на мобильных").check();
  }
  await saveAppearance();
  await page.goto("/");
  await expect
    .poll(async () => page.evaluate(() => getComputedStyle(document.body).backgroundImage), { timeout: 15000 })
    .not.toContain("content-asset");
});

test("VIS-02: SVG отклоняется сервером загрузки", async ({ page }) => {
  await page.goto("/admin/login");
  await loginAdminUi(page);
  await page.waitForURL(/\/admin$/);

  // page.request делит куки со страницей
  const response = await page.request.post("/api/admin/upload", {
    multipart: {
      file: { name: "evil.svg", mimeType: "image/svg+xml", buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>') },
      section: "background",
      name: "evil-svg",
    },
  });
  expect(response.status()).toBe(400);
});
