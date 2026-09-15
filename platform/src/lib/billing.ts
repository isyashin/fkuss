/** Биллинг платформы: чистые функции. Деньги — только в копейках (Int). */

export function dailyChargeKopecks(monthlyPriceRub: number): number {
  return Math.floor((monthlyPriceRub * 100) / 30);
}

/** Сколько полных дней хватит баланса при дневном списании */
export function daysLeft(balanceKopecks: number, dailyCharge: number): number {
  if (dailyCharge <= 0) return Infinity;
  if (balanceKopecks <= 0) return 0;
  return Math.floor(balanceKopecks / dailyCharge);
}

export interface SiteBillingState {
  state: "active" | "grace" | "suspended";
  balanceKopecks: number;
  graceDays: number;
  /** сколько дней сайт уже в текущем состоянии (для grace) */
  daysInState: number;
}

export function nextState(input: SiteBillingState): "active" | "grace" | "suspended" {
  if (input.balanceKopecks > 0) return "active";
  if (input.state === "active") return "grace";
  if (input.state === "grace") {
    return input.daysInState >= input.graceDays ? "suspended" : "grace";
  }
  return "suspended";
}

const NOTIFY_THRESHOLDS = [7, 3, 1];

/** Порог уведомления или null. alreadySent — пороги, по которым уже слали в этом цикле. */
export function shouldNotify(days: number, alreadySent: number[]): number | null {
  if (!Number.isFinite(days)) return null;
  for (const threshold of NOTIFY_THRESHOLDS) {
    if (days === threshold && !alreadySent.includes(threshold)) return threshold;
  }
  return null;
}
