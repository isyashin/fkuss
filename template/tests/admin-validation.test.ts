import { describe, expect, it } from "vitest";
import { parseAdminInput, adminMoneySchema, adminPercentSchema, timeSchema } from "@/lib/admin-validation";

describe("admin action runtime validation", () => {
  it("rejects non-finite and out-of-range money", () => {
    expect(() => parseAdminInput(adminMoneySchema, Number.NaN)).toThrow();
    expect(() => parseAdminInput(adminMoneySchema, Number.POSITIVE_INFINITY)).toThrow();
    expect(() => parseAdminInput(adminMoneySchema, -1)).toThrow();
    expect(() => parseAdminInput(adminMoneySchema, 1_000_001)).toThrow();
  });

  it("rejects percentages outside the supported range", () => {
    expect(() => parseAdminInput(adminPercentSchema, Number.NaN)).toThrow();
    expect(() => parseAdminInput(adminPercentSchema, -101)).toThrow();
    expect(() => parseAdminInput(adminPercentSchema, 501)).toThrow();
  });

  it("accepts valid times and rejects malformed or impossible times", () => {
    expect(parseAdminInput(timeSchema, "09:30")).toBe("09:30");
    expect(() => parseAdminInput(timeSchema, "9:30")).toThrow();
    expect(() => parseAdminInput(timeSchema, "25:00")).toThrow();
  });
});
