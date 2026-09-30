import { describe, expect, it } from "vitest";
import { formatAdminDate } from "@/lib/admin-date";

describe("admin date formatting", () => {
  it("uses the restaurant timezone on both server and browser", () => {
    const date = new Date("2026-09-25T16:00:00.000Z");
    expect(formatAdminDate(date, "Europe/Moscow")).toContain("19:00");
    expect(formatAdminDate(date, "UTC")).toContain("16:00");
  });
});
