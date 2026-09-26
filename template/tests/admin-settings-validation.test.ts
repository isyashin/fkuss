import { describe, expect, it } from "vitest";
import settings from "../content/settings.json";
import { validateSettingsMutation, validateThemeMutation, validateBackgroundMutation } from "@/lib/admin-settings-validation";

describe("admin settings server validation", () => {
  it("accepts the complete current settings document", () => {
    expect(validateSettingsMutation(settings).delivery.enabled).toBe(settings.delivery.enabled);
    expect(validateSettingsMutation(settings).guestContact).toEqual({ whatsapp: true, telegram: true });
  });

  it.each([
    ["minimum order", { delivery: { ...settings.delivery, minOrder: -1 } }],
    ["delivery price", { delivery: { ...settings.delivery, zones: [{ name: "Тест", price: -1, freeFrom: null }] } }],
    ["cashback", { loyalty: { ...settings.loyalty, cashbackPercent: 101 } }],
    ["bonus spend", { loyalty: { ...settings.loyalty, maxSpendPercent: 101 } }],
    ["pricing coefficient", { pricing: { globalMode: "coefficient", globalPercent: -101 } }],
  ])("rejects invalid %s before database write", (_name, patch) => {
    expect(() => validateSettingsMutation({ ...settings, ...patch })).toThrow();
  });

  it("rejects invalid site appearance values", () => {
    expect(() => validateThemeMutation({ preset: "unknown", accent: "#ffffff" })).toThrow();
    expect(() => validateThemeMutation({ preset: "warm", accent: "red" })).toThrow();
    expect(() => validateBackgroundMutation({ enabled: true, image: "../secret", position: "center", dimPercent: 20, disableOnMobile: false })).toThrow();
    expect(() => validateBackgroundMutation({ enabled: true, image: "", position: "center", dimPercent: 101, disableOnMobile: false })).toThrow();
  });
});
