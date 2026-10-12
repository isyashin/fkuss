import { describe, expect, it } from "vitest";
import { SETTINGS_CONFLICT, assertSettingsRev, readSettingsRev } from "@/lib/admin-settings-version";

describe("admin settings version (F04: конфликт вкладок)", () => {
  it("readSettingsRev: отсутствующая версия — 0", () => {
    expect(readSettingsRev(null)).toBe(0);
    expect(readSettingsRev({})).toBe(0);
    expect(readSettingsRev({ value: {} })).toBe(0);
  });

  it("readSettingsRev: читает _rev из сырого JSON настроек", () => {
    expect(readSettingsRev({ _rev: 7 })).toBe(7);
    expect(readSettingsRev({ _rev: 7, restaurant: { name: "X" } })).toBe(7);
  });

  it("сохранение без ожидаемой версии проходит и назначает следующую", () => {
    expect(assertSettingsRev({ _rev: 4 }, undefined)).toBe(5);
    expect(assertSettingsRev(null, null)).toBe(1);
  });

  it("совпадающая версия проходит и инкрементируется", () => {
    expect(assertSettingsRev({ _rev: 4 }, 4)).toBe(5);
  });

  it("устаревшая версия отклоняется с маркером конфликта", () => {
    expect(() => assertSettingsRev({ _rev: 5 }, 4)).toThrowError(SETTINGS_CONFLICT);
  });

  it("force обходит проверку (явная перезапись из диалога)", () => {
    expect(assertSettingsRev({ _rev: 9 }, 4, true)).toBe(10);
  });
});
