/**
 * Окна доставки: генерация и валидация по правилу DeliveryOption.
 * Время — локаль ресторана (tz), now инжектируется (тестируемо).
 */

export interface DeliveryOptionRule {
  name: string;
  mode: "asap" | "scheduled";
  enabled: boolean;
  days: number[]; // 0..6 (вс..сб)
  hoursFrom: string;
  hoursTo: string;
  slotMinutes: number;
  minAheadMinutes: number;
  daysAhead: number;
  price: number;
  freeFrom: number | null;
  exceptions: string[];
}

export interface DeliveryWindow {
  date: string; // YYYY-MM-DD (локаль)
  start: string; // HH:MM
  end: string; // HH:MM
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function toTime(minutes: number): string {
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Локальные дата/время ресторана для момента now в поясе tz */
export function restaurantLocal(now: Date, tz: string): { date: string; minutes: number; day: number } {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const minutes = toMinutes(`${get("hour")}:${get("minute")}`);
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return { date, minutes, day };
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function slotsForDate(rule: DeliveryOptionRule, date: string, afterMinutes: number): DeliveryWindow[] {
  if (!rule.enabled) return [];
  if (rule.exceptions.includes(date)) return [];
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (!rule.days.includes(day)) return [];

  const from = Math.max(toMinutes(rule.hoursFrom), afterMinutes);
  const to = toMinutes(rule.hoursTo);
  const windows: DeliveryWindow[] = [];
  for (let t = from; t < to; t += rule.slotMinutes) {
    windows.push({ date, start: toTime(t), end: toTime(Math.min(t + rule.slotMinutes, to)) });
  }
  return windows;
}

export function generateWindows(rule: DeliveryOptionRule, now: Date, tz: string): DeliveryWindow[] {
  if (rule.mode === "asap") return [];
  const local = restaurantLocal(now, tz);
  const windows: DeliveryWindow[] = [];
  for (let d = 0; d <= rule.daysAhead; d++) {
    const date = addDays(local.date, d);
    const after = d === 0 ? local.minutes + rule.minAheadMinutes : 0;
    windows.push(...slotsForDate(rule, date, after));
  }
  return windows;
}

export function isValidWindow(
  rule: DeliveryOptionRule,
  date: string,
  start: string,
  end: string,
  now: Date,
  tz: string,
): boolean {
  return generateWindows(rule, now, tz).some(
    (w) => w.date === date && w.start === start && w.end === end,
  );
}

/** Цена варианта доставки с порогом бесплатности */
export function deliveryPrice(rule: DeliveryOptionRule, itemsTotal: number): number {
  if (rule.freeFrom !== null && itemsTotal >= rule.freeFrom) return 0;
  return rule.price;
}
