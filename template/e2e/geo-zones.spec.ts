import { test, expect } from "@playwright/test";
import { gotoAdmin, loginAdminUi } from "./login-admin";

// Зоны на карте: geo-режим выключен по умолчанию; включение без ключа геокодера
// даёт честные ответы (geocoder-error), заказ в geo-режиме — 503.
// Дефолтный вариант «Курьер» временно удаляем (иначе вытесняет зоны),
// всё состояние восстанавливаем, чтобы соседние спеки не пострадали.
function ip(project: string, n: number) {
  const projectOctet = project === "mobile-360" ? 1 : project === "webkit-mobile" ? 2 : 3;
  return { "x-forwarded-for": `10.99.19.${projectOctet}${n}` };
}

async function setGeoZones(page: import("@playwright/test").Page, enabled: boolean) {
  await gotoAdmin(page, "/admin/settings?section=delivery");
  await page.getByRole("checkbox", { name: /Зоны на карте/ }).setChecked(enabled);
  // Кнопка «Сохранить» общих условий доставки всегда на месте (issue #59) —
  // скоупимся на панель зон.
  await page.getByRole("group", { name: "Сохранение зон доставки" }).getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Сохранено")).toBeVisible({ timeout: 15000 });
}

test("geo-режим: default выключен; без ключа геокодера UI и заказ отказывают честно", async ({ page, request }, testInfo) => {
  const p = testInfo.project.name;

  // 1. По умолчанию API зон выключен (демо-контент: geo.enabled = false)
  const disabled = await (await request.get("/api/delivery/zone?address=Тверская 1", { headers: ip(p, 1) })).json();
  expect(disabled.kind).toBe("disabled");

  // 2. Включаем зоны на карте («варианты доставки» из продукта убраны — зоны всегда активны)
  await page.goto("/admin/login");
  await loginAdminUi(page);
  await page.waitForURL(/\/admin$/);
  await setGeoZones(page, true);

  try {
    // 4. API зон: geo-режим активен, ключа геокодера в тестовом окружении нет
    const zone = await (await request.get("/api/delivery/zone?address=Тверская 1", { headers: ip(p, 2) })).json();
    expect(zone.kind).toBe("geocoder-error");

    // 5. Витрина: статус «Не удалось проверить адрес», кнопка заблокирована
    await page.setExtraHTTPHeaders(ip(p, 3));
    await page.goto("/menu");
    await page.getByRole("button", { name: /Хачапури по-аджарски/ }).click();
    await page.getByRole("button", { name: /Добавить ·/ }).click();
    await page.getByRole("button", { name: /Корзина · 1/ }).click();
    await page.getByRole("button", { name: /Оформить ·/ }).click();
    await page.getByLabel("Город").fill("Москва");
    await page.getByLabel("Улица").fill("Тверская");
    await page.getByLabel("Дом", { exact: true }).fill("1");
    await expect(page.getByText("Не удалось проверить адрес")).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: /^Заказать/ })).toBeDisabled();

    // 6. Прямой заказ в geo-режиме — честный 503
    const order = await request.post("/api/order", {
      headers: ip(p, 4),
      data: {
        items: [{ dishId: "khachapuri-adjarski", quantity: 2, modifierIds: [] }],
        type: "delivery",
        zoneName: null,
        address: "Москва, Тверская 1",
        customerName: "Тест зон",
        customerPhone: "+79990000019",
        website: "",
      },
    });
    expect(order.status()).toBe(503);
  } finally {
    // 7. Возвращаем настройки
    await setGeoZones(page, false);
  }

  const restored = await (await request.get("/api/delivery/zone?address=Тверская 1", { headers: ip(p, 5) })).json();
  expect(restored.kind).toBe("disabled");
});
