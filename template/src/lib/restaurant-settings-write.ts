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
  return updateRestaurantRow(db, (current) => {
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
