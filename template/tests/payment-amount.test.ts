import { describe, it, expect } from "vitest";
import { paymentAmountForOrder } from "@/lib/order/pricing";

// BUG-002: платёж должен включать цену выбранного варианта доставки
describe("paymentAmountForOrder", () => {
  it("сумма платежа равна итогу заказа с доставкой-вариантом", () => {
    // заказ 1000 ₽ + доставка 300 ₽ → платёж 1300 ₽
    expect(paymentAmountForOrder({ itemsTotal: 1000, deliveryPrice: 300, bonusSpent: 0 })).toBe(1300);
  });

  it("учитывает списание бонусов", () => {
    expect(paymentAmountForOrder({ itemsTotal: 1000, deliveryPrice: 300, bonusSpent: 200 })).toBe(1100);
  });

  it("бесплатная доставка по порогу — доставка 0", () => {
    expect(paymentAmountForOrder({ itemsTotal: 2000, deliveryPrice: 0, bonusSpent: 0 })).toBe(2000);
  });

  it("не может быть отрицательной", () => {
    expect(paymentAmountForOrder({ itemsTotal: 100, deliveryPrice: 0, bonusSpent: 100 })).toBe(0);
  });
});
