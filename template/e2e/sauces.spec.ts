import { test, expect } from "@playwright/test";

// MOD-01 (обязательный): три соуса полностью учитываются сервером и хранятся в снимке
const TOMAT = "shashlik-baranina:sauces:sauce-tomat";
const SATSEBELI = "shashlik-baranina:sauces:sauce-satsebeli";
const ADJIKA = "shashlik-baranina:sauces:sauce-adjika";

function orderBody(modifierIds: string[]) {
  return {
    items: [{ dishId: "shashlik-baranina", quantity: 1, modifierIds }],
    type: "pickup",
    zoneName: null,
    address: "",
    customerName: "Тест соусов",
    customerPhone: "+79990000003",
    website: "",
  };
}

test("три соуса: сумма = блюдо + все три соуса, снимок содержит все варианты", async ({ request }, testInfo) => {
  // Отдельный rate-limit бакет на проект: IP зависит от имени проекта
  const headers = { "x-forwarded-for": `10.99.4.${testInfo.project.name === "mobile" ? 11 : 12}` };
  const response = await request.post("/api/order", { data: orderBody([TOMAT, SATSEBELI, ADJIKA]), headers });
  expect(response.ok()).toBe(true);
  const data = await response.json();
  // 550 + 50 + 50 + 60 = 710
  expect(data.total).toBe(710);
  expect(data.itemsTotal).toBe(710);
});

test("четвёртый соус сверх max=3 отклоняется сервером", async ({ request }, testInfo) => {
  const headers = { "x-forwarded-for": `10.99.5.${testInfo.project.name === "mobile" ? 11 : 12}` };
  const response = await request.post("/api/order", { data: orderBody([TOMAT, SATSEBELI, ADJIKA, TOMAT]), headers });
  expect(response.status()).toBe(400);
});

test("чужой modifierId отклоняется сервером", async ({ request }, testInfo) => {
  const headers = { "x-forwarded-for": `10.99.6.${testInfo.project.name === "mobile" ? 11 : 12}` };
  const response = await request.post("/api/order", { data: orderBody(["khinkali-baranina:extra-1"]), headers });
  expect(response.status()).toBe(400);
});
