import { describe, expect, it } from "vitest";
import {
  assertBonusSpendAllowed,
  GUEST_CABINET_DEFAULTS,
  getSmtpConfig,
  isGuestCabinetEnabled,
  normalizeGuestCabinet,
} from "@/lib/guest-cabinet";

describe("guest cabinet settings", () => {
  it("default: cabinet disabled even when the block is absent", () => {
    expect(normalizeGuestCabinet(undefined)).toEqual(GUEST_CABINET_DEFAULTS);
    expect(normalizeGuestCabinet({} as never)).toEqual(GUEST_CABINET_DEFAULTS);
    expect(isGuestCabinetEnabled(undefined)).toBe(false);
    expect(isGuestCabinetEnabled({ guestCabinet: { enabled: true, authMode: "screen", smtpUrl: "", smtpFrom: "" } })).toBe(true);
  });

  it("partial block keeps remaining defaults", () => {
    const cab = normalizeGuestCabinet({ guestCabinet: { enabled: true } as never });
    expect(cab).toEqual({ enabled: true, authMode: "screen", smtpUrl: "", smtpFrom: "" });
  });

  it("smtp config falls back to env when fields are empty", () => {
    const oldUrl = process.env.SMTP_URL;
    const oldFrom = process.env.SMTP_FROM;
    process.env.SMTP_URL = "smtps://env-user:env-pass@mail.example:465";
    process.env.SMTP_FROM = "env@example.ru";
    try {
      expect(getSmtpConfig(GUEST_CABINET_DEFAULTS)).toEqual({ url: "smtps://env-user:env-pass@mail.example:465", from: "env@example.ru" });
      const own = { enabled: true, authMode: "email" as const, smtpUrl: "smtps://u:p@own:465", smtpFrom: "own@example.ru" };
      expect(getSmtpConfig(own)).toEqual({ url: "smtps://u:p@own:465", from: "own@example.ru" });
      // пробелы в полях не мешают фолбэку
      expect(getSmtpConfig({ ...own, smtpUrl: "   ", smtpFrom: "" }).url).toBe("smtps://env-user:env-pass@mail.example:465");
    } finally {
      if (oldUrl === undefined) delete process.env.SMTP_URL; else process.env.SMTP_URL = oldUrl;
      if (oldFrom === undefined) delete process.env.SMTP_FROM; else process.env.SMTP_FROM = oldFrom;
    }
  });

  it("rejects bonus spend when the cabinet is disabled", () => {
    expect(() => assertBonusSpendAllowed(false, 1)).toThrow("Бонусы недоступны");
    expect(() => assertBonusSpendAllowed(false, 0)).not.toThrow();
    expect(() => assertBonusSpendAllowed(true, 100)).not.toThrow();
  });
});
