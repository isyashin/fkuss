import { describe, it, expect } from "vitest";
import {
  getScheduleForDate,
  generateSlots,
  isValidBookingTime,
  isOpenAt,
  type WeeklySchedule,
} from "@/lib/hours";

const schedule: WeeklySchedule = {
  days: {
    mon: { open: true, from: "12:00", to: "23:30" },
    tue: { open: true, from: "12:00", to: "23:30" },
    wed: { open: true, from: "12:00", to: "23:30" },
    thu: { open: true, from: "12:00", to: "23:30" },
    fri: { open: true, from: "12:00", to: "01:00" }, // ночной режим
    sat: { open: true, from: "11:00", to: "01:00" },
    sun: { open: false, from: "12:00", to: "23:00" }, // выходной
  },
  exceptions: [
    { date: "2026-12-31", open: true, from: "12:00", to: "18:00" },
    { date: "2026-01-01", open: false, from: "12:00", to: "23:00" },
  ],
};

describe("getScheduleForDate", () => {
  it("обычный день — расписание дня недели", () => {
    // 2026-09-14 — понедельник
    expect(getScheduleForDate(schedule, "2026-09-14")).toEqual({ open: true, from: "12:00", to: "23:30" });
  });

  it("выходной день недели", () => {
    // 2026-09-20 — воскресенье
    expect(getScheduleForDate(schedule, "2026-09-20").open).toBe(false);
  });

  it("исключение переопределяет день недели", () => {
    // 2026-12-31 — четверг, но исключение до 18:00
    expect(getScheduleForDate(schedule, "2026-12-31")).toEqual({ open: true, from: "12:00", to: "18:00" });
  });

  it("исключение-выходной", () => {
    expect(getScheduleForDate(schedule, "2026-01-01").open).toBe(false);
  });
});

describe("generateSlots", () => {
  it("слоты внутри рабочего дня", () => {
    const slots = generateSlots(schedule, "2026-09-14", 60);
    expect(slots[0]).toBe("12:00");
    expect(slots).toContain("23:00");
    expect(slots).not.toContain("23:30");
    expect(slots).not.toContain("11:00");
  });

  it("шаг слота", () => {
    const slots = generateSlots(schedule, "2026-09-14", 30);
    expect(slots).toContain("12:30");
    expect(slots.length).toBe(23);
  });

  it("ночной режим (через полночь)", () => {
    const slots = generateSlots(schedule, "2026-09-18", 60); // пятница до 01:00
    expect(slots).toContain("23:00");
    expect(slots).toContain("00:00");
    expect(slots).not.toContain("01:00");
  });

  it("выходной — пусто", () => {
    expect(generateSlots(schedule, "2026-09-20", 60)).toEqual([]);
  });

  it("исключение урезает день", () => {
    const slots = generateSlots(schedule, "2026-12-31", 60);
    expect(slots[slots.length - 1]).toBe("17:00");
  });
});

describe("isValidBookingTime", () => {
  it("валидное время внутри слотов", () => {
    expect(isValidBookingTime(schedule, "2026-09-14", "19:00", 30)).toBe(true);
  });

  it("невалидное время вне слотов", () => {
    expect(isValidBookingTime(schedule, "2026-09-14", "03:00", 30)).toBe(false);
    expect(isValidBookingTime(schedule, "2026-09-14", "23:30", 30)).toBe(false);
  });

  it("выходной — любое время невалидно", () => {
    expect(isValidBookingTime(schedule, "2026-09-20", "19:00", 30)).toBe(false);
  });

  it("слот в ночном режиме", () => {
    expect(isValidBookingTime(schedule, "2026-09-18", "00:00", 30)).toBe(true);
  });
});

describe("isOpenAt", () => {
  it("открыто внутри рабочих часов", () => {
    expect(isOpenAt(schedule, "2026-09-14", "15:00")).toBe(true);
  });

  it("закрыто до открытия", () => {
    expect(isOpenAt(schedule, "2026-09-14", "08:00")).toBe(false);
  });

  it("закрыто после закрытия", () => {
    expect(isOpenAt(schedule, "2026-09-14", "23:45")).toBe(false);
  });

  it("ночной режим: открыто после полуночи", () => {
    expect(isOpenAt(schedule, "2026-09-19", "00:30")).toBe(true); // ночь с пт на сб
  });

  it("выходной — закрыто всегда", () => {
    expect(isOpenAt(schedule, "2026-09-20", "15:00")).toBe(false);
  });
});
