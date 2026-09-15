"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/db";
import { isAdmin } from "@/lib/admin-auth";
import type { ContentSettings } from "@/lib/content-schema";

async function guard() {
  if (!(await isAdmin())) throw new Error("Forbidden");
}

export async function saveSettings(settings: ContentSettings): Promise<void> {
  await guard();
  const prisma = getPrisma();
  await prisma.settings.upsert({
    where: { key: "settings" },
    create: { key: "settings", value: JSON.parse(JSON.stringify(settings)) },
    update: { value: JSON.parse(JSON.stringify(settings)) },
  });
  revalidatePath("/admin/settings");
  revalidatePath("/menu");
  revalidatePath("/booking");
}

export async function saveTheme(theme: { preset: string; accent: string }): Promise<void> {
  await guard();
  const prisma = getPrisma();
  const row = await prisma.settings.findUnique({ where: { key: "theme" } });
  const current = (row?.value ?? {}) as Record<string, unknown>;
  await prisma.settings.upsert({
    where: { key: "theme" },
    create: { key: "theme", value: JSON.parse(JSON.stringify({ ...current, ...theme })) },
    update: { value: JSON.parse(JSON.stringify({ ...current, ...theme })) },
  });
  revalidatePath("/");
  revalidatePath("/menu");
}
