import { describe, it, expect } from "vitest";
import {
  zoneTariffs,
  tariffPrice,
  tariffLines,
  calculateDeliveryPrice,
  type DeliveryZone,
} from "@/lib/order/pricing";

describe("zoneTariffs (нормализация)", () => {
  it("новые тарифы возвращаются по возрастанию from", () => {
    const zone: DeliveryZone = {
      name: "Центр",
      tariffs: [
        { from: 2000, price: 0 },
        { from: 0, price: 300 },
      ],
    };
    expect(zoneTariffs(zone)).toEqual([
      { from: 0, price: 300 },
      { from: 2000, price: 0 },
    ]);
  });

  it("legacy price/freeFrom мигрируют в два уровня", () => {
    const zone: DeliveryZone = { name: "Центр", price: 300, freeFrom: 2000 };
    expect(zoneTariffs(zone)).toEqual([
      { from: 0, price: 300 },
      { from: 2000, price: 0 },
    ]);
  });

  it("legacy без freeFrom — один уровень", () => {
    const zone: DeliveryZone = { name: "Окраина", price: 350, freeFrom: null };
    expect(zoneTariffs(zone)).toEqual([{ from: 0, price: 350 }]);
  });

  it("тарифы приоритетнее legacy-полей", () => {
    const zone: DeliveryZone = {
      name: "Центр",
      price: 999,
      freeFrom: 1,
      tariffs: [{ from: 0, price: 250 }],
    };
    expect(zoneTariffs(zone)).toEqual([{ from: 0, price: 250 }]);
  });
});

describe("tariffPrice (расчёт по уровням)", () => {
  const tariffs = [
    { from: 0, price: 400 },
    { from: 3500, price: 350 },
    { from: 5000, price: 300 },
  ];

  it("сумма ниже первого порога — цена первого уровня", () => {
    expect(tariffPrice(tariffs, 0)).toBe(400);
    expect(tariffPrice(tariffs, 3499)).toBe(400);
  });

  it("на границе уровня — его цена", () => {
    expect(tariffPrice(tariffs, 3500)).toBe(350);
    expect(tariffPrice(tariffs, 5000)).toBe(300);
  });

  it("между уровнями — цена ближайшего нижнего", () => {
    expect(tariffPrice(tariffs, 4999)).toBe(350);
    expect(tariffPrice(tariffs, 12000)).toBe(300);
  });
});

describe("tariffLines (сводка для списка зон)", () => {
  it("один уровень с ценой", () => {
    const zone: DeliveryZone = { name: "Центр", tariffs: [{ from: 0, price: 200 }] };
    expect(tariffLines(zone)).toEqual(["Доставка 200 ₽"]);
  });

  it("один уровень бесплатно", () => {
    const zone: DeliveryZone = { name: "Центр", tariffs: [{ from: 0, price: 0 }] };
    expect(tariffLines(zone)).toEqual(["Доставка бесплатно"]);
  });

  it("несколько уровней — строка на уровень, бесплатный уровень словами", () => {
    const zone: DeliveryZone = {
      name: "Центр",
      tariffs: [
        { from: 0, price: 400 },
        { from: 5000, price: 0 },
      ],
    };
    expect(tariffLines(zone)).toEqual(["Доставка 400 ₽", "от 5 000 ₽ — бесплатно"]);
  });

  it("legacy зона даёт привычную сводку", () => {
    const zone: DeliveryZone = { name: "Центр", price: 200, freeFrom: 2000 };
    expect(tariffLines(zone)).toEqual(["Доставка 200 ₽", "от 2 000 ₽ — бесплатно"]);
  });
});

describe("calculateDeliveryPrice с тарифами и enabled", () => {
  const zones: DeliveryZone[] = [
    { name: "Центр", enabled: true, tariffs: [{ from: 0, price: 200 }, { from: 2000, price: 0 }] },
    { name: "Выключена", enabled: false, tariffs: [{ from: 0, price: 100 }] },
    { name: "Legacy", price: 350, freeFrom: null },
  ];

  it("считает по тарифам выбранной зоны", () => {
    expect(calculateDeliveryPrice("delivery", 1500, zones, "Центр")).toBe(200);
    expect(calculateDeliveryPrice("delivery", 2000, zones, "Центр")).toBe(0);
  });

  it("legacy-зона без тарифов считается по price", () => {
    expect(calculateDeliveryPrice("delivery", 100, zones, "Legacy")).toBe(350);
  });

  it("выключенная зона — ошибка", () => {
    expect(() => calculateDeliveryPrice("delivery", 100, zones, "Выключена")).toThrow(/недоступна/);
  });

  it("pickup бесплатен независимо от зон", () => {
    expect(calculateDeliveryPrice("pickup", 100, zones, "Центр")).toBe(0);
  });
});
