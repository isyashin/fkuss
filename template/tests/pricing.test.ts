import { describe, it, expect } from "vitest";
import {
  calculateItemsTotal,
  calculateDeliveryPrice,
  checkMinOrder,
  calculateMaxBonusSpend,
  calculateBonusAccrual,
  calculateOrder,
  type OrderItemInput,
  type DeliveryZone,
} from "@/lib/order/pricing";

const zones: DeliveryZone[] = [
  { name: "Центр", price: 200, freeFrom: 2000 },
  { name: "Окраина", price: 350, freeFrom: null },
];

const dish = (price: number, modifiers: number[] = []): OrderItemInput => ({
  dishId: "d1",
  price,
  quantity: 1,
  modifierPrices: modifiers,
});

describe("calculateItemsTotal", () => {
  it("считает сумму позиций без модификаторов", () => {
    expect(calculateItemsTotal([dish(320, [])])).toBe(320);
  });

  it("учитывает количество", () => {
    const item = { ...dish(320), quantity: 3 };
    expect(calculateItemsTotal([item])).toBe(960);
  });

  it("прибавляет цену модификаторов к цене блюда", () => {
    expect(calculateItemsTotal([dish(490, [90, 50])])).toBe(630);
  });

  it("модификаторы умножаются вместе с блюдом", () => {
    const item = { ...dish(490, [90]), quantity: 2 };
    expect(calculateItemsTotal([item])).toBe(1160);
  });

  it("пустая корзина = 0", () => {
    expect(calculateItemsTotal([])).toBe(0);
  });
});

describe("calculateDeliveryPrice", () => {
  it("самовывоз всегда бесплатный", () => {
    expect(calculateDeliveryPrice("pickup", 100, zones, "Центр")).toBe(0);
  });

  it("доставка — цена зоны", () => {
    expect(calculateDeliveryPrice("delivery", 1000, zones, "Центр")).toBe(200);
  });

  it("бесплатная доставка от freeFrom", () => {
    expect(calculateDeliveryPrice("delivery", 2000, zones, "Центр")).toBe(0);
    expect(calculateDeliveryPrice("delivery", 1999, zones, "Центр")).toBe(200);
  });

  it("зона без freeFrom — всегда платная", () => {
    expect(calculateDeliveryPrice("delivery", 99999, zones, "Окраина")).toBe(350);
  });

  it("неизвестная зона — ошибка", () => {
    expect(() => calculateDeliveryPrice("delivery", 1000, zones, "Марс")).toThrow();
  });
});

describe("checkMinOrder", () => {
  it("проходит при сумме >= minOrder", () => {
    expect(checkMinOrder(800, 800).ok).toBe(true);
  });

  it("отклоняет при сумме < minOrder", () => {
    const result = checkMinOrder(799, 800);
    expect(result.ok).toBe(false);
  });

  it("minOrder=0 — всегда ок", () => {
    expect(checkMinOrder(1, 0).ok).toBe(true);
  });
});

describe("calculateMaxBonusSpend", () => {
  it("не больше maxSpendPercent от суммы позиций", () => {
    expect(calculateMaxBonusSpend(1000, 20)).toBe(200);
  });

  it("не больше баланса клиента", () => {
    expect(calculateMaxBonusSpend(1000, 20, 100)).toBe(100);
  });

  it("0 при нулевом балансе", () => {
    expect(calculateMaxBonusSpend(1000, 20, 0)).toBe(0);
  });

  it("округляет вниз", () => {
    expect(calculateMaxBonusSpend(999, 20)).toBe(199);
  });
});

describe("calculateBonusAccrual", () => {
  it("кэшбэк-процент от оплаченной суммы", () => {
    expect(calculateBonusAccrual(1000, 5)).toBe(50);
  });

  it("не начисляется на часть, оплаченную бонусами", () => {
    // итог 1000, из них 200 бонусами → база 800 → 40
    expect(calculateBonusAccrual(1000, 5, 200)).toBe(40);
  });

  it("0 при полной оплате бонусами", () => {
    expect(calculateBonusAccrual(1000, 5, 1000)).toBe(0);
  });
});

describe("calculateOrder (сквозной расчёт)", () => {
  it("доставка: позиции + доставка − бонусы", () => {
    const result = calculateOrder({
      items: [dish(490, [90]), { ...dish(320), quantity: 2 }],
      type: "delivery",
      zoneName: "Центр",
      zones,
      minOrder: 800,
      requestedBonusSpend: 0,
      bonusBalance: 500,
      maxSpendPercent: 20,
      cashbackPercent: 5,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // 580 + 640 = 1220 позиции; доставка 200 (1220 < 2000)
    expect(result.itemsTotal).toBe(1220);
    expect(result.deliveryPrice).toBe(200);
    expect(result.total).toBe(1420);
    expect(result.bonusSpent).toBe(0);
    // кэшбэк с 1420 = 71
    expect(result.bonusAccrued).toBe(71);
  });

  it("списывает бонусы с лимитом и начисляет кэшбэк без бонусной части", () => {
    const result = calculateOrder({
      items: [dish(1000)],
      type: "pickup",
      zoneName: null,
      zones,
      minOrder: 0,
      requestedBonusSpend: 500,
      bonusBalance: 500,
      maxSpendPercent: 20,
      cashbackPercent: 5,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bonusSpent).toBe(200); // не больше 20% от 1000
    expect(result.total).toBe(800);
    expect(result.bonusAccrued).toBe(40); // 5% от 800
  });

  it("бесплатная доставка при достижении freeFrom", () => {
    const result = calculateOrder({
      items: [{ ...dish(1000), quantity: 2 }],
      type: "delivery",
      zoneName: "Центр",
      zones,
      minOrder: 800,
      requestedBonusSpend: 0,
      bonusBalance: 0,
      maxSpendPercent: 20,
      cashbackPercent: 5,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deliveryPrice).toBe(0);
    expect(result.total).toBe(2000);
  });

  it("отклоняет заказ ниже минимальной суммы", () => {
    const result = calculateOrder({
      items: [dish(500)],
      type: "delivery",
      zoneName: "Центр",
      zones,
      minOrder: 800,
      requestedBonusSpend: 0,
      bonusBalance: 0,
      maxSpendPercent: 20,
      cashbackPercent: 5,
    });
    expect(result.ok).toBe(false);
  });
});
