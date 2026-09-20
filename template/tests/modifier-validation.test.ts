import { describe, it, expect } from "vitest";
import { validateModifierSelection, type GroupRule } from "@/lib/order/modifier-validation";

const groups: GroupRule[] = [
  {
    id: "g1",
    name: "Соусы",
    minSelected: 0,
    maxSelected: 3,
    modifierIds: ["m1", "m2", "m3"],
  },
  {
    id: "g2",
    name: "Размер",
    minSelected: 1,
    maxSelected: 1,
    modifierIds: ["s1", "s2"],
  },
];

describe("validateModifierSelection", () => {
  it("MOD-01: три соуса из одной группы max=3 — валидно", () => {
    const result = validateModifierSelection(groups, ["s1", "m1", "m2", "m3"]);
    expect(result.ok).toBe(true);
  });

  it("MOD-02: группа max=1 — два значения отклоняются", () => {
    const result = validateModifierSelection(groups, ["s1", "s2"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Размер");
  });

  it("MOD-03: обязательный min=1 без выбора — отказ", () => {
    const result = validateModifierSelection(groups, []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Размер");
  });

  it("MOD-04: чужой modifier ID — отказ", () => {
    const result = validateModifierSelection(groups, ["s1", "x9"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("неизвестный");
  });

  it("MOD-05: повтор ID сверх лимита — отказ", () => {
    const result = validateModifierSelection(groups, ["s1", "m1", "m1", "m1", "m1"]);
    expect(result.ok).toBe(false);
  });

  it("группа без min — пустой выбор валиден", () => {
    const noMin: GroupRule[] = [{ id: "g1", name: "Соусы", minSelected: 0, maxSelected: 3, modifierIds: ["m1"] }];
    expect(validateModifierSelection(noMin, []).ok).toBe(true);
  });
});
