/**
 * Резолвер цен: индивидуальные и глобальные режимы.
 * Документ: ТЗ §7. Отрицательная цена зажимается в 0.
 */

export interface PriceSettings {
  globalMode: "yandex" | "manual" | "coefficient";
  globalPercent: number; // для coefficient
}

export interface PricedDish {
  price: number; // текущая цена (fallback)
  yandexPrice: number | null;
  manualPrice: number | null;
  priceMode: "inherit" | "yandex" | "manual" | "coefficient";
  coefficientPercent: number | null;
}

export interface PricedModifier {
  price: number; // текущая цена (fallback)
  yandexPrice: number | null;
  manualPrice: number | null;
}

function clampNonNegative(value: number): number {
  return Math.max(0, value);
}

function coefficient(base: number | null, percent: number, fallback: number): number {
  if (base === null) return fallback;
  return clampNonNegative(Math.round(base * (1 + percent / 100)));
}

export function resolveDishPrice(dish: PricedDish, settings: PriceSettings): number {
  const mode = dish.priceMode === "inherit" ? settings.globalMode : dish.priceMode;
  const percent = dish.priceMode === "inherit" || dish.coefficientPercent === null
    ? settings.globalPercent
    : dish.coefficientPercent;

  switch (mode) {
    case "manual":
      return dish.manualPrice ?? dish.price;
    case "coefficient":
      return coefficient(dish.yandexPrice, percent, dish.price);
    case "yandex":
    default:
      return dish.yandexPrice ?? dish.price;
  }
}

export function resolveModifierPrice(mod: PricedModifier, settings: PriceSettings): number {
  if (mod.manualPrice !== null) return mod.manualPrice;
  if (settings.globalMode === "coefficient") {
    return coefficient(mod.yandexPrice, settings.globalPercent, mod.price);
  }
  return mod.yandexPrice ?? mod.price;
}
