import { describe, expect, it } from "vitest";
import { adminLandingNext, validateAdminNext } from "@/lib/admin-next";

describe("validateAdminNext — только свои маршруты админки", () => {
  it("принимает пути админского дерева и строгий query", () => {
    expect(validateAdminNext("/admin")).toBe("/admin");
    expect(validateAdminNext("/admin?selected=clx123_ABC")).toBe("/admin?selected=clx123_ABC");
    expect(validateAdminNext("/admin/bookings?selected=clx1&mode=new")).toBe("/admin/bookings?selected=clx1&mode=new");
    expect(validateAdminNext("/admin/settings?section=team")).toBe("/admin/settings?section=team");
    expect(validateAdminNext("/admin/menu")).toBe("/admin/menu");
  });

  it("отклоняет внешние адреса, схемы и двойные слэши", () => {
    expect(validateAdminNext(null)).toBeNull();
    expect(validateAdminNext("")).toBeNull();
    expect(validateAdminNext("https://evil.example/admin")).toBeNull();
    expect(validateAdminNext("//evil.example")).toBeNull();
    expect(validateAdminNext("javascript:alert(1)")).toBeNull();
    expect(validateAdminNext("/admin?next=//evil")).toBeNull();
    expect(validateAdminNext("/admin?selected=a%2fb")).toBeNull();
    expect(validateAdminNext("/admin?selected=a%5cb")).toBeNull();
  });

  it("отклоняет бэкслеши, управляющие символы и чужие деревья", () => {
    expect(validateAdminNext("/\\evil")).toBeNull();
    expect(validateAdminNext("/admin\\..\\login")).toBeNull();
    expect(validateAdminNext("/admin\x00")).toBeNull();
    expect(validateAdminNext("/adminism")).toBeNull();
    expect(validateAdminNext("/ADMIN")).toBeNull();
    expect(validateAdminNext("admin")).toBeNull();
    expect(validateAdminNext("/account")).toBeNull();
    expect(validateAdminNext("/admin?bad=^$")).toBeNull();
    expect(validateAdminNext(`/${"a".repeat(400)}`)).toBeNull();
  });

  it("adminLandingNext отдаёт fallback при отказе", () => {
    expect(adminLandingNext("/admin/bookings")).toBe("/admin/bookings");
    expect(adminLandingNext("https://evil")).toBe("/admin");
    expect(adminLandingNext(undefined)).toBe("/admin");
  });
});
