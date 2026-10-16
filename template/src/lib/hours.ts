/**
 * Часы работы ресторана: расписание по дням недели + исключения по датам.
 * Поддержка ночного режима (to < from = через полночь).
 */

import { addLocalDays, isValidLocalDate, isValidLocalTime } from "./local-date";

export interface DaySchedule {
  open: boolean;
  from: string; // "HH:MM"
  to: string; // "HH:MM" (может быть меньше from = через полночь)
}

export interface DayException extends DaySchedule {
  date: string; // "YYYY-MM-DD"
}

export interface WeeklySchedule {
  days: Partial<Record<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", DaySchedule>>;
  exceptions: DayException[];
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/**
 * Расписание из данных ресторана: если есть schedule — берём его,
 * иначе строим из workHours[0] (единые часы на все дни).
 */
export function resolveSchedule(restaurant: {
  workHours?: { days: string; from: string; to: string }[];
  schedule?: WeeklySchedule;
}): WeeklySchedule {
  if (restaurant.schedule && Object.keys(restaurant.schedule.days).length > 0) {
    return restaurant.schedule;
  }
  const base = restaurant.workHours?.[0];
  const day: DaySchedule = base
    ? { open: true, from: base.from, to: base.to }
    : { open: false, from: "00:00", to: "00:00" };
  return {
    days: { mon: day, tue: day, wed: day, thu: day, fri: day, sat: day, sun: day },
    exceptions: [],
  };
}

function dayKey(dateStr: string): (typeof DAY_KEYS)[number] {
  const day = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
  return DAY_KEYS[day];
}

export function getScheduleForDate(schedule: WeeklySchedule, date: string): DaySchedule {
  const exception = schedule.exceptions.find((e) => e.date === date);
  if (exception) return { open: exception.open, from: exception.from, to: exception.to };
  return (
    schedule.days[dayKey(date)] ?? { open: false, from: "00:00", to: "00:00" }
  );
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

/** Интервалы относительно календарной даты; ночной хвост принадлежит следующему дню.
 * Исключение по дате целиком заменяет часы этой даты, включая хвост вчерашней смены. */
function calendarIntervals(schedule: WeeklySchedule, date: string): { from: number; to: number }[] {
  if (!isValidLocalDate(date)) return [];
  const intervals: { from: number; to: number }[] = [];
  const exception = schedule.exceptions.find((entry) => entry.date === date);
  if (!exception) {
    const previous = getScheduleForDate(schedule, addLocalDays(date, -1));
    if (previous.open) {
      const from = toMinutes(previous.from);
      const to = toMinutes(previous.to);
      if (to <= from && to > 0) intervals.push({ from: from - 1440, to });
    }
  }
  const day = getScheduleForDate(schedule, date);
  if (day.open) {
    const from = toMinutes(day.from);
    const to = toMinutes(day.to);
    intervals.push({ from, to: to <= from ? 1440 : to });
  }
  return intervals;
}

/** Слоты "HH:MM" внутри рабочего дня (последний слот начинается до закрытия) */
export function generateSlots(
  schedule: WeeklySchedule,
  date: string,
  slotMinutes: number,
): string[] {
  if (!Number.isInteger(slotMinutes) || slotMinutes <= 0 || slotMinutes > 1440) return [];
  const slots = new Set<number>();
  for (const { from, to } of calendarIntervals(schedule, date)) {
    // Шаг сохраняется от начала смены, в том числе для её ночного хвоста.
    const start = from < 0 ? from + Math.ceil(-from / slotMinutes) * slotMinutes : from;
    for (let t = start; t < to; t += slotMinutes) slots.add(t);
  }
  return [...slots].sort((a, b) => a - b).map(toTime);
}

export function isValidBookingTime(
  schedule: WeeklySchedule,
  date: string,
  time: string,
  slotMinutes: number,
): boolean {
  return generateSlots(schedule, date, slotMinutes).includes(time);
}

/** Открыт ли ресторан в конкретные дату и время */
export function isOpenAt(schedule: WeeklySchedule, date: string, time: string): boolean {
  if (!isValidLocalTime(time)) return false;
  const t = toMinutes(time);
  return calendarIntervals(schedule, date).some(({ from, to }) => t >= from && t < to);
}

/** Текущие дата и время в таймзоне ресторана — для isOpenAt (без таймзоны сервера).
 * Некорректная таймзона откатывается к Europe/Moscow. */
export function nowInTimeZone(tz: string, now = new Date()): { date: string; time: string } {
  let timeZone = tz;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
  } catch {
    timeZone = 'Europe/Moscow';
  }
  const s = new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    dateStyle: 'short',
    timeStyle: 'short',
    hourCycle: 'h23',
  }).format(now);
  const [date, time] = s.split(' ');
  return { date, time };
}
