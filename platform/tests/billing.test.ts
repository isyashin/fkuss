import { describe, it, expect } from "vitest";
import {
  dailyChargeKopecks,
  daysLeft,
  nextState,
  shouldNotify,
  type SiteBillingState,
} from "@/lib/billing";

describe("dailyChargeKopecks", () => {
  it("месячный тариф делится на 30 в копейках", () => {
    expect(dailyChargeKopecks(3000)).toBe(10000); // 3000₽/мес = 100₽/день = 10000 коп
  });

  it("округляет вниз до копейки", () => {
    expect(dailyChargeKopecks(1000)).toBe(3333); // 33,33 ₽/день
  });

  it("нулевой тариф — 0", () => {
    expect(dailyChargeKopecks(0)).toBe(0);
  });
});

describe("daysLeft", () => {
  it("сколько дней хватит баланса", () => {
    // 700₽ при 100₽/день = 7 дней
    expect(daysLeft(70000, 10000)).toBe(7);
  });

  it("отрицательный баланс — 0", () => {
    expect(daysLeft(-5000, 10000)).toBe(0);
  });

  it("бесплатный тариф — бесконечность", () => {
    expect(daysLeft(0, 0)).toBe(Infinity);
  });
});

describe("nextState (переходы состояния сайта)", () => {
  const site = (state: SiteBillingState["state"], daysInState = 0): SiteBillingState => ({
    state,
    balanceKopecks: 0,
    graceDays: 3,
    daysInState,
  });

  it("положительный баланс — всегда active", () => {
    expect(nextState({ ...site("grace", 10), balanceKopecks: 100 })).toBe("active");
    expect(nextState({ ...site("suspended", 10), balanceKopecks: 1 })).toBe("active");
  });

  it("баланс < 0 из active → grace", () => {
    expect(nextState(site("active"))).toBe("grace");
  });

  it("grace не дольше graceDays — остаётся grace", () => {
    expect(nextState(site("grace", 2))).toBe("grace");
  });

  it("grace дольше graceDays → suspended", () => {
    expect(nextState(site("grace", 3))).toBe("suspended");
  });

  it("suspended остаётся suspended без денег", () => {
    expect(nextState(site("suspended", 30))).toBe("suspended");
  });
});

describe("shouldNotify (пороги 7/3/1 дней)", () => {
  it("шлём при ровно 7, 3, 1 днях", () => {
    expect(shouldNotify(7, [])).toBe(7);
    expect(shouldNotify(3, [])).toBe(3);
    expect(shouldNotify(1, [])).toBe(1);
  });

  it("не шлём дважды по тому же порогу", () => {
    expect(shouldNotify(7, [7])).toBeNull();
  });

  it("не шлём вне порогов", () => {
    expect(shouldNotify(5, [])).toBeNull();
    expect(shouldNotify(30, [])).toBeNull();
  });

  it("после пополнения пороги сбрасываются (новый цикл)", () => {
    expect(shouldNotify(3, [7])).toBe(3);
  });
});
