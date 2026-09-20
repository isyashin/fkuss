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

export async function saveBackground(input: {
  enabled: boolean;
  image: string;
  position: "center" | "top" | "bottom";
  dimPercent: number;
  disableOnMobile: boolean;
}): Promise<void> {
  await guard();
  const prisma = getPrisma();
  const row = await prisma.settings.findUnique({ where: { key: "theme" } });
  const current = (row?.value ?? {}) as { background?: { image?: string } } & Record<string, unknown>;
  const oldImage = current.background?.image;

  await prisma.settings.upsert({
    where: { key: "theme" },
    create: { key: "theme", value: JSON.parse(JSON.stringify({ ...current, background: input })) },
    update: { value: JSON.parse(JSON.stringify({ ...current, background: input })) },
  });

  // Старый файл удаляем ТОЛЬКО после успешной записи нового состояния
  if (oldImage && oldImage !== input.image) {
    try {
      const { unlink } = await import("node:fs/promises");
      const path = await import("node:path");
      const abs = path.join(process.cwd(), "content", oldImage);
      if (abs.startsWith(path.join(process.cwd(), "content"))) {
        await unlink(abs).catch(() => {});
      }
    } catch {
      // удаление старого файла не критично
    }
  }

  revalidatePath("/");
  revalidatePath("/menu");
  revalidatePath("/admin/settings");
}

export async function savePricing(pricing: { globalMode: string; globalPercent: number }): Promise<void> {
  await guard();
  const prisma = getPrisma();
  const row = await prisma.settings.findUnique({ where: { key: "settings" } });
  const current = (row?.value ?? {}) as Record<string, unknown>;
  await prisma.settings.upsert({
    where: { key: "settings" },
    create: { key: "settings", value: JSON.parse(JSON.stringify({ ...current, pricing })) },
    update: { value: JSON.parse(JSON.stringify({ ...current, pricing })) },
  });
  const { recomputePrices } = await import("@/lib/order/recompute");
  await recomputePrices(prisma);
  revalidatePath("/admin/settings");
  revalidatePath("/admin/menu");
  revalidatePath("/menu");
  revalidatePath("/");
}
