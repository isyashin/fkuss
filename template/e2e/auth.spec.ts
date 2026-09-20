import { test, expect } from "@playwright/test";

// Вход по email-коду (dev-режим: код возвращается в ответе API)
test("гость входит по коду и видит кабинет", async ({ page, request }, testInfo) => {
  const email = `e2e-${testInfo.project.name}-${Date.now()}@example.com`;
  const authIp = { "x-forwarded-for": `10.99.12.${testInfo.project.name === "mobile" ? 1 : 2}` };

  const codeResponse = await request.post("/api/auth/request-code", {
    data: { email },
    headers: authIp,
  });
  expect(codeResponse.ok()).toBe(true);
  const { devCode } = await codeResponse.json();
  expect(devCode).toMatch(/^\d{6}$/);

  const verifyResponse = await request.post("/api/auth/verify", {
    data: { email, code: devCode },
  });
  expect(verifyResponse.ok()).toBe(true);

  // Кука сессии применяется к странице через контекст request → page
  const cookies = await request.storageState();
  await page.context().addCookies(cookies.cookies);

  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Личный кабинет" })).toBeVisible();
  await expect(page.getByText("Бонусы")).toBeVisible();
});

test("неверный код отклоняется", async ({ request }, testInfo) => {
  const email = `e2e-bad-${testInfo.project.name}-${Date.now()}@example.com`;
  const authIp = { "x-forwarded-for": `10.99.13.${testInfo.project.name === "mobile" ? 1 : 2}` };
  await request.post("/api/auth/request-code", { data: { email }, headers: authIp });
  const response = await request.post("/api/auth/verify", {
    data: { email, code: "000000" },
  });
  expect(response.status()).toBe(400);
});
