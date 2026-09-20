import { describe, it, expect } from "vitest";
import {
  resolveDishPrice,
  resolveModifierPrice,
  type PriceSettings,
  type PricedDish,
  type PricedModifier,
} from "@/lib/order/price-resolver";

const settings = (mode: PriceSettings["globalMode"], percent = 0): PriceSettings => ({
  globalMode: mode,
  globalPercent: percent,
});

const dish = (over: Partial<PricedDish>): PricedDish => ({
  price: 100,
  yandexPrice: 500,
  manualPrice: null,
  priceMode: "inherit",
  coefficientPercent: null,
  ...over,
});

describe("resolveDishPrice", () => {
  it("PRICE-01: глобальный режим yandex — цена источника", () => {
    expect(resolveDishPrice(dish({}), settings("yandex"))).toBe(500);
  });

  it("PRICE-02: глобальная ручная — используется ручная цена", () => {
    expect(resolveDishPrice(dish({ manualPrice: 450 }), settings("manual"))).toBe(450);
  });

  it("PRICE-03: коэффициенты +10% и −10%, округление математическое", () => {
    expect(resolveDishPrice(dish({}), settings("coefficient", 10))).toBe(550);
    expect(resolveDishPrice(dish({}), settings("coefficient", -10))).toBe(450);
    // 555 × 0.95 = 527,25 → 527 (математическое, не floor)
    expect(resolveDishPrice(dish({ yandexPrice: 555 }), settings("coefficient", -5))).toBe(527);
  });

  it("PRICE-04: индивидуальное правило блюда приоритетнее глобального", () => {
    expect(
      resolveDishPrice(dish({ priceMode: "manual", manualPrice: 700 }), settings("yandex")),
    ).toBe(700);
    expect(
      resolveDishPrice(dish({ priceMode: "coefficient", coefficientPercent: 20 }), settings("coefficient", -50)),
    ).toBe(600);
  });

  it("PRICE-05: inherit — применяется глобальное правило", () => {
    expect(resolveDishPrice(dish({ priceMode: "inherit", manualPrice: 700 }), settings("yandex"))).toBe(500);
  });

  it("PRICE-06: нет базовой цены Яндекс — режимы yandex/coefficient недоступны, откат на текущую", () => {
    expect(resolveDishPrice(dish({ yandexPrice: null }), settings("yandex"))).toBe(100);
    expect(resolveDishPrice(dish({ yandexPrice: null }), settings("coefficient", 50))).toBe(100);
  });

  it("PRICE-07: отрицательный итог зажимается в 0", () => {
    expect(resolveDishPrice(dish({ yandexPrice: 50 }), settings("coefficient", -150))).toBe(0);
  });

  it("ручная цена без значения — откат на текущую", () => {
    expect(resolveDishPrice(dish({ manualPrice: null }), settings("manual"))).toBe(100);
  });
});

describe("resolveModifierPrice", () => {
  const mod = (over: Partial<PricedModifier>): PricedModifier => ({
    price: 10,
    yandexPrice: 50,
    manualPrice: null,
    ...over,
  });

  it("PRICE-08: коэффициент применяется к модификатору без ручной цены", () => {
    expect(resolveModifierPrice(mod({}), settings("coefficient", 10))).toBe(55);
  });

  it("PRICE-09: ручная цена модификатора приоритетнее коэффициента", () => {
    expect(resolveModifierPrice(mod({ manualPrice: 80 }), settings("coefficient", 10))).toBe(80);
  });

  it("без yandexPrice — откат на текущую цену", () => {
    expect(resolveModifierPrice(mod({ yandexPrice: null }), settings("coefficient", 50))).toBe(10);
  });
});
