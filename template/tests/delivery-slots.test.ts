import { describe, it, expect } from "vitest";
import { generateWindows, isValidWindow, type DeliveryOptionRule } from "@/lib/delivery/slots";

const option = (over: Partial<DeliveryOptionRule> = {}): DeliveryOptionRule => ({
  name: "Курьер",
  mode: "scheduled",
  enabled: true,
  days: [0, 1, 2, 3, 4, 5, 6],
  hoursFrom: "11:00",
  hoursTo: "22:00",
  slotMinutes: 60,
  minAheadMinutes: 60,
  daysAhead: 3,
  price: 300,
  freeFrom: 2000,
  exceptions: [],
  ...over,
});

// 2026-09-16 12:00 UTC (среда) — ресторан в Europe/Moscow (+3) = 15:00 лок.
const NOW = new Date("2026-09-16T12:00:00Z");
const TZ = "Europe/Moscow";

describe("generateWindows", () => {
  it("DEL-02: плановые интервалы сегодня от minAhead", () => {
    const windows = generateWindows(option(), NOW, TZ);
    expect(windows.length).toBeGreaterThan(0);
    expect(windows[0].date).toBe("2026-09-16");
    // 15:00 лок + 60 мин = 16:00 — первый слот не раньше
    expect(windows[0].start >= "16:00").toBe(true);
  });

  it("DEL-03: заказ на завтра ночью — завтрашние интервалы доступны", () => {
    const lateNight = new Date("2026-09-16T21:30:00Z"); // 00:30 лок 17.09
    const windows = generateWindows(option(), lateNight, TZ);
    expect(windows.some((w) => w.date === "2026-09-17")).toBe(true);
  });

  it("DEL-05: минимальное время приготовления отсекает ранние слоты", () => {
    const windows = generateWindows(option({ minAheadMinutes: 300 }), NOW, TZ);
    expect(windows[0].start >= "20:00").toBe(true); // 15:00 + 300 = 20:00
  });

  it("DEL-06: день-исключение закрыт", () => {
    const windows = generateWindows(option({ exceptions: ["2026-09-17"] }), NOW, TZ);
    expect(windows.some((w) => w.date === "2026-09-17")).toBe(false);
  });

  it("день вне разрешённых — пусто", () => {
    const onlySunday = generateWindows(option({ days: [0] }), NOW, TZ); // ср — не воскресенье
    expect(onlySunday.every((w) => w.date !== "2026-09-16")).toBe(true);
  });

  it("глубина предзаказа ограничена daysAhead", () => {
    const windows = generateWindows(option({ daysAhead: 1 }), NOW, TZ);
    const dates = new Set(windows.map((w) => w.date));
    expect(dates.has("2026-09-16")).toBe(true);
    expect(dates.has("2026-09-17")).toBe(true);
    expect(dates.has("2026-09-18")).toBe(false);
  });

  it("асап: режим asap не генерирует интервалов, но валиден", () => {
    const windows = generateWindows(option({ mode: "asap" }), NOW, TZ);
    expect(windows).toEqual([]);
  });

  it("выключенный вариант — пусто", () => {
    expect(generateWindows(option({ enabled: false }), NOW, TZ)).toEqual([]);
  });
});

describe("isValidWindow", () => {
  it("DEL-04: прошедший слот отклоняется", () => {
    expect(isValidWindow(option(), "2026-09-16", "11:00", "12:00", NOW, TZ)).toBe(false);
  });

  it("валидный будущий слот принимается", () => {
    expect(isValidWindow(option(), "2026-09-16", "18:00", "19:00", NOW, TZ)).toBe(true);
  });

  it("несуществующий слот (вне часов) отклоняется", () => {
    expect(isValidWindow(option(), "2026-09-16", "23:00", "23:59", NOW, TZ)).toBe(false);
  });

  it("слот в день-исключение отклоняется", () => {
    expect(isValidWindow(option({ exceptions: ["2026-09-17"] }), "2026-09-17", "12:00", "13:00", NOW, TZ)).toBe(false);
  });
});
