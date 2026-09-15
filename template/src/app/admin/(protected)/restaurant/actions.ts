"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/db";
import { isAdmin } from "@/lib/admin-auth";
import type { WeeklySchedule, DaySchedule } from "@/lib/hours";

const DAY_NAMES: Record<string, string> = {
  mon: "пн", tue: "вт", wed: "ср", thu: "чт", fri: "пт", sat: "сб", sun: "вс",
};
const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/** workHours-строки для отображения в контактах (группировка одинаковых дней) */
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
    const days = names.length === 7 ? "пн–вс" : names.join(", ");
    result.push({ days, from, to });
  }
  return result;
}

export async function saveRestaurant(input: {
  name: string;
  phone: string;
  email: string;
  address: string;
  socials: { telegram: string; max: string; whatsapp: string; vk: string };
  schedule: WeeklySchedule;
}): Promise<void> {
  if (!(await isAdmin())) throw new Error("Forbidden");

  const prisma = getPrisma();
  const row = await prisma.settings.findUnique({ where: { key: "restaurant" } });
  const current = (row?.value ?? {}) as Record<string, unknown>;

  const updated = {
    ...current,
    name: input.name,
    phone: input.phone,
    email: input.email,
    address: input.address,
    socials: input.socials,
    schedule: input.schedule,
    workHours: deriveWorkHours(input.schedule),
  };

  await prisma.settings.upsert({
    where: { key: "restaurant" },
    create: { key: "restaurant", value: JSON.parse(JSON.stringify(updated)) },
    update: { value: JSON.parse(JSON.stringify(updated)) },
  });

  revalidatePath("/admin/restaurant");
  revalidatePath("/");
  revalidatePath("/booking");
}
