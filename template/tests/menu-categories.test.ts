import { describe, expect, it } from "vitest";
import {
  assertCategoryDeletable,
  categoryReorderUpdates,
  CATEGORY_HAS_DISHES_MESSAGE,
  dishMatchesAdminFilter,
  filterAdminMenuCategories,
} from "@/lib/menu-categories";

describe("guards категорий меню", () => {
  it("пустую категорию удалять можно", () => {
    expect(() => assertCategoryDeletable(0)).not.toThrow();
  });

  it("категорию с блюдами удалять нельзя — ошибка понятная", () => {
    expect(() => assertCategoryDeletable(1)).toThrow(CATEGORY_HAS_DISHES_MESSAGE);
    expect(() => assertCategoryDeletable(5)).toThrow(/есть блюда/);
  });
});

describe("categoryReorderUpdates", () => {
  const rows = [
    { id: "a", position: 0 },
    { id: "b", position: 1 },
    { id: "c", position: 2 },
  ];

  it("меняет позиции с соседом при движении вверх", () => {
    expect(categoryReorderUpdates(rows, "b", "up")).toEqual([
      { id: "b", position: 0 },
      { id: "a", position: 1 },
    ]);
  });

  it("меняет позиции с соседом при движении вниз", () => {
    expect(categoryReorderUpdates(rows, "b", "down")).toEqual([
      { id: "b", position: 2 },
      { id: "c", position: 1 },
    ]);
  });

  it("на краю списка — пустой результат (действие не требуется)", () => {
    expect(categoryReorderUpdates(rows, "a", "up")).toEqual([]);
    expect(categoryReorderUpdates(rows, "c", "down")).toEqual([]);
  });

  it("неизвестный id — пустой результат", () => {
    expect(categoryReorderUpdates(rows, "zzz", "up")).toEqual([]);
  });
});

describe("filterAdminMenuCategories (issue #68: пустые категории видны в админке)", () => {
  const dish = (name: string, available = true) => ({ name, description: "", composition: "", available });
  const category = (id: string, dishes: ReturnType<typeof dish>[]) => ({ id, dishes });
  const all = { needle: "", availability: "all" as const };

  it("пустая категория (без блюд вовсе) остаётся в списке", () => {
    const result = filterAdminMenuCategories([category("a", [dish("Суп")]), category("b", [])], all);
    expect(result.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("пустая категория видна даже при поиске без совпадений", () => {
    const result = filterAdminMenuCategories([category("a", [dish("Суп")]), category("b", [])], { needle: "пицца", availability: "all" });
    expect(result.map((c) => c.id)).toEqual(["b"]);
    expect(result[0].dishes).toEqual([]);
  });

  it("категория с блюдами скрывается, только если фильтр не оставил блюд", () => {
    const categories = [category("a", [dish("Суп"), dish("Салат")]), category("b", [dish("Пицца")])];
    const result = filterAdminMenuCategories(categories, { needle: "суп", availability: "all" });
    expect(result.map((c) => c.id)).toEqual(["a"]);
    expect(result[0].dishes.map((d) => d.name)).toEqual(["Суп"]);
  });

  it("фильтр доступности оставляет категорию, если есть подходящие блюда", () => {
    const categories = [category("a", [dish("Суп"), dish("Салат", false)]), category("b", [dish("Пицца", false)])];
    expect(filterAdminMenuCategories(categories, { needle: "", availability: "available" }).map((c) => c.id)).toEqual(["a"]);
    expect(filterAdminMenuCategories(categories, { needle: "", availability: "unavailable" }).map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("выбранная в селекте категория показывается всегда", () => {
    const categories = [category("a", [dish("Суп")]), category("b", [dish("Пицца")])];
    const result = filterAdminMenuCategories(categories, { needle: "суп", availability: "all" }, "b");
    expect(result.map((c) => c.id)).toEqual(["a", "b"]);
    expect(result.find((c) => c.id === "b")?.dishes).toEqual([]);
  });
});

describe("dishMatchesAdminFilter", () => {
  const d = { name: "Цезарь", description: "Курица", composition: "Салат", available: true };

  it("ищет по названию, описанию и составу без учёта регистра", () => {
    expect(dishMatchesAdminFilter(d, { needle: "цезарь", availability: "all" })).toBe(true);
    expect(dishMatchesAdminFilter(d, { needle: "КУРИЦА", availability: "all" })).toBe(true);
    expect(dishMatchesAdminFilter(d, { needle: "салат", availability: "all" })).toBe(true);
    expect(dishMatchesAdminFilter(d, { needle: "пицца", availability: "all" })).toBe(false);
  });

  it("фильтрует по доступности", () => {
    expect(dishMatchesAdminFilter(d, { needle: "", availability: "available" })).toBe(true);
    expect(dishMatchesAdminFilter(d, { needle: "", availability: "unavailable" })).toBe(false);
  });
});
