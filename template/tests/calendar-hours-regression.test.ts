import { describe, expect, it } from "vitest";
import { generateSlots, isOpenAt, isValidBookingTime, type WeeklySchedule } from "@/lib/hours";

const night: WeeklySchedule = { days: { mon: { open: true, from: "18:00", to: "02:00" } }, exceptions: [] };
describe("calendar dates of overnight shifts", () => {
  it("does not move Monday's tail into Monday morning", () => {
    expect(isOpenAt(night, "2026-10-19", "01:00")).toBe(false);
    expect(isValidBookingTime(night, "2026-10-19", "01:00", 60)).toBe(false);
    expect(generateSlots(night, "2026-10-19", 60)).toEqual(["18:00", "19:00", "20:00", "21:00", "22:00", "23:00"]);
  });
  it("offers the tail on the following calendar date even without a Tuesday shift", () => {
    expect(generateSlots(night, "2026-10-20", 60)).toEqual(["00:00", "01:00"]);
    expect(isOpenAt(night, "2026-10-20", "01:00")).toBe(true);
    expect(isValidBookingTime(night, "2026-10-20", "01:00", 60)).toBe(true);
    expect(isOpenAt(night, "2026-10-20", "02:00")).toBe(false);
  });
  it("a dated closure overrides all hours of that calendar date", () => {
    const closed: WeeklySchedule = { ...night, exceptions: [{ date: "2026-10-20", open: false, from: "00:00", to: "00:00" }] };
    expect(generateSlots(closed, "2026-10-20", 60)).toEqual([]);
    expect(isOpenAt(closed, "2026-10-20", "01:00")).toBe(false);
  });
  it("a shortened previous shift has no overnight tail", () => {
    expect(generateSlots({ ...night, exceptions: [{ date: "2026-10-19", open: true, from: "18:00", to: "21:00" }] }, "2026-10-20", 60)).toEqual([]);
  });
});
