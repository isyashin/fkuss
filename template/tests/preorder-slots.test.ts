import { describe, it, expect } from "vitest";
import {
  formatPreOrderSlot,
  generatePreOrderSlots,
  isValidPreOrderSlot,
  normalizePreOrder,
  type PreOrderSettings,
} from "@/lib/order/preorder";

const preOrder = (over: Partial<PreOrderSettings> = {}): PreOrderSettings => ({
  enabled: true,
  slots: ["10:00", "10:30", "11:00"],
  daysAhead: 1,
  minAheadMinutes: 30,
  ...over,
});

// 2026-09-16 12:00 UTC (среда) — ресторан в Europe/Moscow (+3) = 15:00 лок.
const NOW = new Date("2026-09-16T12:00:00Z");
const TZ = "Europe/Moscow";

describe("generatePreOrderSlots", () => {
  it("прошедшие на сегодня слоты не предлагаются", () => {
    const slots = generatePreOrderSlots(preOrder(), NOW, TZ);
    const today = slots.filter((s) => s.date === "2026-09-16");
    // 15:00 лок + 30 мин = 15:30 — только слоты не раньше
    expect(today.map((s) => s.time)).toEqual([]);
  });

  it("сегодняшние слоты доступны, когда запас от «сейчас» выдержан", () => {
    const early = new Date("2026-09-16T06:30:00Z"); // 09:30 лок
    const slots = generatePreOrderSlots(preOrder(), early, TZ);
    const today = slots.filter((s) => s.date === "2026-09-16");
    expect(today.map((s) => s.time)).toEqual(["10:00", "10:30", "11:00"]);
  });

  it("minAheadMinutes отсекает ближайшие слоты", () => {
    const early = new Date("2026-09-16T06:30:00Z"); // 09:30 лок
    const slots = generatePreOrderSlots(preOrder({ minAheadMinutes: 45 }), early, TZ);
    const today = slots.filter((s) => s.date === "2026-09-16");
    expect(today.map((s) => s.time)).toEqual(["10:30", "11:00"]);
  });

  it("завтрашние слоты доступны при daysAhead=1", () => {
    const slots = generatePreOrderSlots(preOrder(), NOW, TZ);
    const tomorrow = slots.filter((s) => s.date === "2026-09-17");
    expect(tomorrow.map((s) => s.time)).toEqual(["10:00", "10:30", "11:00"]);
  });

  it("daysAhead=0 — только сегодня", () => {
    const slots = generatePreOrderSlots(preOrder({ daysAhead: 0 }), NOW, TZ);
    expect(slots.every((s) => s.date === "2026-09-16")).toBe(true);
  });

  it("выключенный предзаказ — пусто", () => {
    expect(generatePreOrderSlots(preOrder({ enabled: false }), NOW, TZ)).toEqual([]);
  });

  it("пустой список слотов — пусто", () => {
    expect(generatePreOrderSlots(preOrder({ slots: [] }), NOW, TZ)).toEqual([]);
  });

  it("malformed-слоты из сырых настроек игнорируются", () => {
    const slots = generatePreOrderSlots(
      { enabled: true, slots: ["10:00", "bad", "25:99", 5], daysAhead: 1, minAheadMinutes: 0 },
      NOW,
      TZ,
    );
    expect(slots.filter((s) => s.date === "2026-09-17").map((s) => s.time)).toEqual(["10:00"]);
  });
});

describe("isValidPreOrderSlot (серверная валидация)", () => {
  it("прошедший слот отклоняется", () => {
    expect(isValidPreOrderSlot(preOrder(), "2026-09-16", "10:00", NOW, TZ)).toBe(false);
  });

  it("слот, которого нет в настройках, отклоняется", () => {
    expect(isValidPreOrderSlot(preOrder(), "2026-09-17", "12:15", NOW, TZ)).toBe(false);
  });

  it("дата вне окна предзаказа отклоняется", () => {
    expect(isValidPreOrderSlot(preOrder(), "2026-09-19", "10:00", NOW, TZ)).toBe(false);
  });

  it("разрешённый будущий слот принимается", () => {
    expect(isValidPreOrderSlot(preOrder(), "2026-09-17", "10:30", NOW, TZ)).toBe(true);
  });

  it("выключенный предзаказ отклоняет любой слот", () => {
    expect(isValidPreOrderSlot(preOrder({ enabled: false }), "2026-09-17", "10:00", NOW, TZ)).toBe(false);
  });
});

describe("normalizePreOrder", () => {
  it("undefined — дефолт выключенного предзаказа", () => {
    expect(normalizePreOrder(undefined)).toEqual({ enabled: false, slots: [], daysAhead: 1, minAheadMinutes: 30 });
  });

  it("частичные настройки из старой БД добиваются дефолтом", () => {
    expect(normalizePreOrder({ enabled: true, slots: ["12:00"] })).toEqual({
      enabled: true,
      slots: ["12:00"],
      daysAhead: 1,
      minAheadMinutes: 30,
    });
  });
});

describe("formatPreOrderSlot", () => {
  it("сегодня и завтра — словами", () => {
    expect(formatPreOrderSlot("2026-09-16", "10:00", NOW, TZ)).toBe("Сегодня, 10:00");
    expect(formatPreOrderSlot("2026-09-17", "10:30", NOW, TZ)).toBe("Завтра, 10:30");
  });

  it("поздние даты — числом", () => {
    expect(formatPreOrderSlot("2026-09-20", "11:00", NOW, TZ)).toContain("11:00");
  });
});
