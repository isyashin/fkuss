import { describe, expect, it } from "vitest";
import { formatAdminDate, formatAdminTime } from "@/lib/admin-date";

describe("admin date formatting", () => {
  it("uses the restaurant timezone on both server and browser", () => {
    const date = new Date("2026-09-25T16:00:00.000Z");
    expect(formatAdminDate(date, "Europe/Moscow")).toContain("19:00");
    expect(formatAdminDate(date, "UTC")).toContain("16:00");
  });
});

describe("admin order time formatting", () => {
  // Стенд Europe/Moscow, ресторан в Уфе (Asia/Yekaterinburg, +2 к Москве).
  it("shows order time in the restaurant timezone, not the server one", () => {
    const date = new Date("2026-09-25T16:00:00.000Z");
    expect(formatAdminTime(date, "Asia/Yekaterinburg")).toMatch(/^21:00/);
    expect(formatAdminTime(date, "Europe/Moscow")).toMatch(/^19:00/);
  });

  it("falls back to Europe/Moscow for an invalid timezone", () => {
    const date = new Date("2026-09-25T16:00:00.000Z");
    expect(formatAdminTime(date, "Not/AZone")).toMatch(/^19:00/);
  });
});
