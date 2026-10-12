"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/db";
import { isAdmin } from "@/lib/admin-auth";
import { resolveSchedule } from "@/lib/hours";
import { getContentDir } from "@/lib/content-dir";
import { getSiteRestaurant } from "@/lib/site";
import {
  readRestaurantSectionRev,
  writeRestaurantLogo,
  writeRestaurantSection,
  type RestaurantEditInput,
  type RestaurantSection,
} from "@/lib/restaurant-settings-write";

export async function saveRestaurant(
  input: RestaurantEditInput,
  section: RestaurantSection,
  expectedRev: number,
  force = false,
): Promise<number | "conflict"> {
  if (!(await isAdmin())) throw new Error("Forbidden");

  const result = await writeRestaurantSection(getPrisma(), input, section, expectedRev, force);
  if (result === "conflict") return result;

  revalidatePath("/admin/restaurant");
  revalidatePath("/admin/settings");
  revalidatePath("/");
  revalidatePath("/booking");
  return result;
}

/** Явное принятие свежей версии после конфликта, без сброса формы из фонового опроса. */
export async function refreshRestaurantSection(section: RestaurantSection): Promise<{ input: RestaurantEditInput; rev: number }> {
  if (!(await isAdmin())) throw new Error("Forbidden");
  const restaurant = await getSiteRestaurant();
  return {
    input: {
      name: restaurant.name,
      phone: restaurant.phone,
      email: restaurant.email,
      address: restaurant.address,
      socials: restaurant.socials,
      schedule: resolveSchedule(restaurant),
    },
    rev: readRestaurantSectionRev(restaurant, section),
  };
}

/** Загрузка логотипа завершена → обновить ссылку в restaurant и перегенерировать PWA-иконки */
export async function afterLogoUpload(): Promise<void> {
  if (!(await isAdmin())) throw new Error("Forbidden");
  const prisma = getPrisma();
  const name = await writeRestaurantLogo(prisma, "images/logo.png");

  const themeRow = await prisma.settings.findUnique({ where: { key: "theme" } });
  const theme = (themeRow?.value ?? {}) as { accent?: string };
  const { generateIcons } = await import("@/lib/pwa-icons");
  await generateIcons(
    getContentDir(),
    { name, logo: "images/logo.png" },
    theme.accent ?? "#b45309",
  );

  revalidatePath("/admin/restaurant");
  revalidatePath("/admin/settings");
  revalidatePath("/");
  revalidatePath("/manifest.webmanifest");
}
