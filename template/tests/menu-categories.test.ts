import { describe, expect, it } from "vitest";
import {
  assertCategoryDeletable,
  categoryReorderUpdates,
  CATEGORY_HAS_DISHES_MESSAGE,
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
