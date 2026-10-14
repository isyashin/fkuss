/**
 * Предзаказ ко времени: генерация и валидация слотов из настроек preOrder.
 * Время — локаль ресторана (tz), now инжектируется (тестируемо).
 */
import { restaurantLocal } from "@/lib/delivery/slots";

export interface PreOrderSettings {
  enabled: boolean;
  slots: string[]; // HH:MM, точки начала
  daysAhead: number;
  minAheadMinutes: number;
}

export interface PreOrderSlot {
  date: string; // YYYY-MM-DD (локаль ресторана)
  time: string; // HH:MM
}

const SLOT_RE = /^\d{2}:\d{2}$/;

function isValidSlotTime(time: string): boolean {
  if (!SLOT_RE.test(time)) return false;
  const [h, m] = time.split(":").map(Number);
  return h <= 23 && m <= 59;
}

/** Ввод слота из редактора: «9:30» → «09:30»; недопустимое время — null. */
export function coerceSlotTime(input: string): string | null {
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(input.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Настройки из БД могли появиться до появления блока — добиваем дефолт. */
export function normalizePreOrder(raw: unknown): PreOrderSettings {
  const value = (raw ?? {}) as Partial<PreOrderSettings>;
  return {
    enabled: value.enabled === true,
    slots: Array.isArray(value.slots)
      ? value.slots.filter((s): s is string => typeof s === "string" && isValidSlotTime(s))
      : [],
    daysAhead: typeof value.daysAhead === "number" && value.daysAhead >= 0 ? Math.floor(value.daysAhead) : 1,
    minAheadMinutes:
      typeof value.minAheadMinutes === "number" && value.minAheadMinutes >= 0
        ? Math.floor(value.minAheadMinutes)
        : 30,
  };
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Доступные слоты: сегодня (без прошедших и без запаса minAhead) + daysAhead суток. */
export function generatePreOrderSlots(preOrder: unknown, now: Date, tz: string): PreOrderSlot[] {
  const settings = normalizePreOrder(preOrder);
  if (!settings.enabled || settings.slots.length === 0) return [];
  const local = restaurantLocal(now, tz);
  const todayCutoff = local.minutes + settings.minAheadMinutes;
  const result: PreOrderSlot[] = [];
  for (let d = 0; d <= settings.daysAhead; d++) {
    const date = addDays(local.date, d);
    for (const time of settings.slots) {
      if (d === 0 && toMinutes(time) < todayCutoff) continue;
      result.push({ date, time });
    }
  }
  return result;
}

/** Серверная валидация: слот должен быть в списке разрешённых и не в прошлом. */
export function isValidPreOrderSlot(preOrder: unknown, date: string, time: string, now: Date, tz: string): boolean {
  return generatePreOrderSlots(preOrder, now, tz).some((s) => s.date === date && s.time === time);
}

/** Абсолютная дата заказа не меняет смысл после полуночи. */
export function formatPreOrderSlot(date: string, time: string): string {
  const [year, month, day] = date.split("-");
  return `${day}.${month}.${year}, ${time}`;
}

export function preOrderSnapshot(date: string, time: string, tz: string) {
  return {
    desiredTime: formatPreOrderSlot(date, time),
    preOrderDate: date,
    preOrderTime: time,
    preOrderTz: tz,
  };
}

/** Старые относительные строки восстанавливаем по локальной дате создания заказа. */
export function formatStoredOrderTime(order: {
  desiredTime: string;
  preOrderDate?: string | null;
  preOrderTime?: string | null;
  createdAt: Date;
}, tz: string): string {
  if (order.preOrderDate && order.preOrderTime) {
    return formatPreOrderSlot(order.preOrderDate, order.preOrderTime);
  }
  const legacy = /^(Сегодня|Завтра), (\d{2}:\d{2})$/.exec(order.desiredTime);
  if (!legacy) return order.desiredTime;
  const createdDate = restaurantLocal(order.createdAt, tz).date;
  return formatPreOrderSlot(addDays(createdDate, legacy[1] === "Завтра" ? 1 : 0), legacy[2]);
}
