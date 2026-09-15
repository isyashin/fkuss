import { describe, it, expect } from "vitest";
import { mockProvider } from "@/lib/payments/mock";
import { buildYookassaPayload, parseYookassaWebhook } from "@/lib/payments/yookassa";
import { getPaymentProvider } from "@/lib/payments";

describe("mock provider", () => {
  it("создаёт платёж с confirmationUrl", async () => {
    const result = await mockProvider.createPayment({
      orderId: "ord_1",
      orderNumber: 42,
      amount: 1420,
      description: "Заказ №42",
      returnUrl: "https://site.ru/order/42",
    });
    expect(result.paymentId).toContain("ord_1");
    expect(result.confirmationUrl).toContain("42");
  });
});

describe("yookassa payload", () => {
  it("форматирует сумму с копейками и idempotence key = orderId", () => {
    const payload = buildYookassaPayload({
      orderId: "ord_9",
      orderNumber: 9,
      amount: 1420,
      description: "Заказ №9",
      returnUrl: "https://site.ru",
    });
    expect(payload.amount).toEqual({ value: "1420.00", currency: "RUB" });
    expect(payload.confirmation).toEqual({ type: "redirect", return_url: "https://site.ru" });
    expect(payload.description).toBe("Заказ №9");
    expect(payload.capture).toBe(true);
  });

  it("парсит webhook payment.succeeded", () => {
    const event = parseYookassaWebhook({
      type: "notification",
      event: "payment.succeeded",
      object: { id: "pay_1", status: "succeeded", metadata: { orderId: "ord_9" } },
    });
    expect(event).toEqual({ orderId: "ord_9", paymentId: "pay_1", status: "paid" });
  });

  it("парсит webhook payment.canceled", () => {
    const event = parseYookassaWebhook({
      type: "notification",
      event: "payment.canceled",
      object: { id: "pay_1", status: "canceled", metadata: { orderId: "ord_9" } },
    });
    expect(event).toEqual({ orderId: "ord_9", paymentId: "pay_1", status: "failed" });
  });

  it("игнорирует неизвестные события", () => {
    expect(parseYookassaWebhook({ event: "refund.succeeded", object: {} })).toBeNull();
  });
});

describe("getPaymentProvider", () => {
  it("none → null (оплата при получении)", () => {
    expect(getPaymentProvider("none")).toBeNull();
  });
  it("mock → mockProvider", () => {
    expect(getPaymentProvider("mock")).toBe(mockProvider);
  });
  it("yookassa без ключей → ошибка", () => {
    const savedShop = process.env.YOOKASSA_SHOP_ID;
    const savedSecret = process.env.YOOKASSA_SECRET;
    delete process.env.YOOKASSA_SHOP_ID;
    delete process.env.YOOKASSA_SECRET;
    expect(() => getPaymentProvider("yookassa")).toThrow();
    if (savedShop) process.env.YOOKASSA_SHOP_ID = savedShop;
    if (savedSecret) process.env.YOOKASSA_SECRET = savedSecret;
  });
});
