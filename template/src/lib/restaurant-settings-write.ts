import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import type { DaySchedule, WeeklySchedule } from "@/lib/hours";

export type RestaurantSection = "contacts" | "hours";

export type RestaurantEditInput = {
  name: string;
  phone: string;
  email: string;
  address: string;
  socials: { telegram: string; max: string; whatsapp: string; vk: string };
  schedule: WeeklySchedule;
};

export type RestaurantContactsField = "phone" | "email" | "whatsapp" | "telegram";
export type RestaurantContactsFieldErrors = Partial<Record<RestaurantContactsField, string>>;

const DAY_NAMES: Record<string, string> = {
  mon: "пн", tue: "вт", wed: "ср", thu: "чт", fri: "пт", sat: "сб", sun: "вс",
};
const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function deriveWorkHours(schedule: WeeklySchedule): { days: string; from: string; to: string }[] {
  const groups = new Map<string, string[]>();
  for (const key of DAY_ORDER) {
    const day = schedule.days[key as keyof WeeklySchedule["days"]] as DaySchedule | undefined;
    if (!day) continue;
    const sig = day.open ? `${day.from}|${day.to}` : "closed";
    groups.set(sig, [...(groups.get(sig) ?? []), DAY_NAMES[key]]);
  }
  const result: { days: string; from: string; to: string }[] = [];
  for (const [sig, names] of groups) {
    if (sig === "closed") continue;
    const [from, to] = sig.split("|");
    result.push({ days: names.length === 7 ? "пн–вс" : names.join(", "), from, to });
  }
  return result;
}

export function readRestaurantSectionRev(raw: unknown, section: RestaurantSection): number {
  const key = section === "contacts" ? "_contactsRev" : "_hoursRev";
  const value = (raw as Record<string, unknown> | null | undefined)?.[key];
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

function isRuPhone(value: string): boolean {
  const v = value.trim();
  if (v === "") return true;
  if (!/^\+?[\d\s()-]+$/.test(v)) return false;
  const digits = v.replace(/\D/g, "");
  return (
    (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) ||
    (digits.length === 10 && digits.startsWith("9"))
  );
}

/** Контакты, выводимые на витрину: телефон/email и соцссылки. Пустые поля допустимы. */
export function validateRestaurantContacts(
  input: Pick<RestaurantEditInput, "phone" | "email" | "socials">,
): RestaurantContactsFieldErrors {
  const errors: RestaurantContactsFieldErrors = {};
  if (!isRuPhone(input.phone)) {
    errors.phone = "Укажите телефон в формате +7 999 123-45-67 или 8 999 123-45-67";
  }
  const email = input.email.trim();
  if (email !== "" && !z.email().safeParse(email).success) {
    errors.email = "Укажите корректный email, например hello@example.ru";
  }
  if (!isRuPhone(input.socials.whatsapp)) {
    errors.whatsapp = "Укажите номер в формате +7 999 123-45-67 или 8 999 123-45-67";
  }
  const telegram = input.socials.telegram.trim();
  if (telegram !== "" && !/^https?:\/\//i.test(telegram)) {
    errors.telegram = "Укажите ссылку вида https://t.me/restaurant";
  }
  return errors;
}

/** Одна секция меняет только свои поля. Соседняя секция и логотип остаются актуальными. */
export function patchRestaurantSection(
  current: Record<string, unknown>,
  input: RestaurantEditInput,
  section: RestaurantSection,
): Record<string, unknown> {
  if (section === "hours") {
    return { ...current, schedule: input.schedule, workHours: deriveWorkHours(input.schedule) };
  }
  return {
    ...current,
    name: input.name,
    phone: input.phone,
    email: input.email,
    address: input.address,
    socials: input.socials,
  };
}

/** Общая блокировка нужна и сохранению логотипа: иначе две записи JSON-строки
 * могут прочитать одно старое значение и затереть независимые поля. */
async function updateRestaurantRow<T>(
  db: PrismaClient,
  update: (current: Record<string, unknown>) => { value: Record<string, unknown> | null; result: T },
): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('settings-restaurant-row'))`;
    const row = await tx.settings.findUnique({ where: { key: "restaurant" } });
    const current = (row?.value ?? {}) as Record<string, unknown>;
    const { value, result } = update(current);
    if (value === null) return result;
    const json = JSON.parse(JSON.stringify(value));
    await tx.settings.upsert({
      where: { key: "restaurant" },
      create: { key: "restaurant", value: json },
      update: { value: json },
    });
    return result;
  });
}

export async function writeRestaurantSection(
  db: PrismaClient,
  input: RestaurantEditInput,
  section: RestaurantSection,
  expectedRev: number,
  force = false,
): Promise<number | "conflict"> {
  if (section !== "contacts" && section !== "hours") throw new Error("Invalid restaurant section");
  if (!Number.isInteger(expectedRev) || expectedRev < 0) throw new Error("Invalid restaurant revision");
  return updateRestaurantRow<number | "conflict">(db, (current) => {
    const rev = readRestaurantSectionRev(current, section);
    if (!force && rev !== expectedRev) return { value: null, result: "conflict" as const };
    const nextRev = rev + 1;
    const key = section === "contacts" ? "_contactsRev" : "_hoursRev";
    return { value: { ...patchRestaurantSection(current, input, section), [key]: nextRev }, result: nextRev };
  });
}

export async function writeRestaurantLogo(db: PrismaClient, logo: string): Promise<string> {
  return updateRestaurantRow(db, (current) => ({
    value: { ...current, logo },
    result: typeof current.name === "string" ? current.name : "Ресторан",
  }));
}
