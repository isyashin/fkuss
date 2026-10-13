import { describe, expect, it } from "vitest";
import {
  assertModifierGroupLimits,
  requiredToMinSelected,
  MODIFIER_GROUP_LIMITS_MESSAGE,
  MODIFIER_MAX_UNLIMITED,
} from "@/lib/menu-modifiers";

describe("assertModifierGroupLimits", () => {
  it("необязательная группа 0..1 — валидно", () => {
    expect(() => assertModifierGroupLimits(0, 1)).not.toThrow();
  });

  it("обязательная группа 1..1 — валидно", () => {
    expect(() => assertModifierGroupLimits(1, 1)).not.toThrow();
  });

  it("несколько выборов 0..99 — валидно", () => {
    expect(() => assertModifierGroupLimits(0, MODIFIER_MAX_UNLIMITED)).not.toThrow();
  });

  it("min больше max — понятная ошибка", () => {
    expect(() => assertModifierGroupLimits(2, 1)).toThrow(MODIFIER_GROUP_LIMITS_MESSAGE);
  });

  it("max 0 — отказ", () => {
    expect(() => assertModifierGroupLimits(0, 0)).toThrow(MODIFIER_GROUP_LIMITS_MESSAGE);
  });

  it("max больше 99 — отказ", () => {
    expect(() => assertModifierGroupLimits(0, 100)).toThrow(MODIFIER_GROUP_LIMITS_MESSAGE);
  });

  it("отрицательный min — отказ", () => {
    expect(() => assertModifierGroupLimits(-1, 3)).toThrow(MODIFIER_GROUP_LIMITS_MESSAGE);
  });

  it("нецелые значения — отказ", () => {
    expect(() => assertModifierGroupLimits(0.5, 3)).toThrow(MODIFIER_GROUP_LIMITS_MESSAGE);
    expect(() => assertModifierGroupLimits(0, 1.5)).toThrow(MODIFIER_GROUP_LIMITS_MESSAGE);
  });
});

describe("requiredToMinSelected", () => {
  it("обязательная группа — минимум 1", () => {
    expect(requiredToMinSelected(true)).toBe(1);
  });

  it("необязательная группа — минимум 0", () => {
    expect(requiredToMinSelected(false)).toBe(0);
  });
});
