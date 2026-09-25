import { describe, it, expect } from "vitest";
import {
  getScheduleForDate,
  generateSlots,
  isValidBookingTime,
  isOpenAt,
  nowInTimeZone,
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

describe("nowInTimeZone", () => {
  // МСК = UTC+3 (без летнего времени)
  it("переводит UTC-момент в локальное время ресторана", () => {
    const now = new Date("2026-09-23T06:30:00Z");
    expect(nowInTimeZone("Europe/Moscow", now)).toEqual({ date: "2026-09-23", time: "09:30" });
  });

  it("переводит дату на следующий день при пересечении полуночи (UTC 23:30 → МСК 02:30)", () => {
    const now = new Date("2026-09-22T23:30:00Z");
    expect(nowInTimeZone("Europe/Moscow", now)).toEqual({ date: "2026-09-23", time: "02:30" });
  });

  it("часы работы через полночь считаются по локальному времени", () => {
    const now = new Date("2026-09-22T21:30:00Z"); // 00:30 МСК
    const { date, time } = nowInTimeZone("Europe/Moscow", now);
    const night: WeeklySchedule = {
      days: {
        mon: { open: true, from: "22:00", to: "03:00" },
        tue: { open: true, from: "22:00", to: "03:00" },
        wed: { open: true, from: "22:00", to: "03:00" },
        thu: { open: true, from: "22:00", to: "03:00" },
        fri: { open: true, from: "22:00", to: "03:00" },
        sat: { open: true, from: "22:00", to: "03:00" },
        sun: { open: true, from: "22:00", to: "03:00" },
      },
      exceptions: [],
    };
    expect(isOpenAt(night, date, time)).toBe(true); // ср 00:30 МСК внутри вт-ночной смены
  });

  it("некорректная таймзона откатывается к Europe/Moscow", () => {
    const now = new Date("2026-09-23T06:30:00Z");
    expect(nowInTimeZone("Invalid/Zone", now)).toEqual({ date: "2026-09-23", time: "09:30" });
  });

  it("рестораторский сценарий: утро по МСК не показывает «закрыто» для графика 09:00–22:00", () => {
    const now = new Date("2026-09-23T06:30:00Z"); // 09:30 МСК
    const { date, time } = nowInTimeZone("Europe/Moscow", now);
    const day: WeeklySchedule = {
      days: {
        mon: { open: true, from: "09:00", to: "22:00" },
        tue: { open: true, from: "09:00", to: "22:00" },
        wed: { open: true, from: "09:00", to: "22:00" },
        thu: { open: true, from: "09:00", to: "22:00" },
        fri: { open: true, from: "09:00", to: "22:00" },
        sat: { open: true, from: "09:00", to: "22:00" },
        sun: { open: true, from: "09:00", to: "22:00" },
      },
      exceptions: [],
    };
    expect(isOpenAt(day, date, time)).toBe(true);
  });
});
