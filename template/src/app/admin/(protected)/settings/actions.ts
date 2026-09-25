"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getPrisma } from "@/lib/db";
import { isAdmin } from "@/lib/admin-auth";
import { guestContactSchema, type ContentSettings } from "@/lib/content-schema";
import { validateSettingsMutation, validateThemeMutation, validateBackgroundMutation } from "@/lib/admin-settings-validation";
import { resolveContentPath } from "@/lib/content-dir";
import { applyAdminSettings, type AdminSettingsInput } from "@/lib/admin-settings-service";
import { getSiteSettings } from "@/lib/site";

async function guard() {
  if (!(await isAdmin())) throw new Error("Forbidden");
}

export async function saveAllAdminSettings(input: AdminSettingsInput): Promise<void> {
  await guard();
  const { previousBackgroundImage } = await applyAdminSettings(getPrisma(), input);
  if (previousBackgroundImage.startsWith("images/background/") && previousBackgroundImage !== input.background.image) {
    const abs = resolveContentPath(previousBackgroundImage);
    if (abs) {
      const { unlink } = await import("node:fs/promises");
      await unlink(abs).catch(() => {});
    }
  }
  for (const path of ["/admin/settings", "/admin/menu", "/", "/menu", "/booking"]) revalidatePath(path);
}

export async function saveSettings(settings: ContentSettings): Promise<void> {
  await guard();
  const parsed = validateSettingsMutation(settings);
  const prisma = getPrisma();
  await prisma.settings.upsert({
    where: { key: "settings" },
    create: { key: "settings", value: JSON.parse(JSON.stringify(parsed)) },
    update: { value: JSON.parse(JSON.stringify(parsed)) },
  });
  revalidatePath("/admin/settings");
  revalidatePath("/menu");
  revalidatePath("/booking");
}

export async function saveGuestContactChannels(input: { whatsapp: boolean; telegram: boolean }): Promise<void> {
  await guard();
  const guestContact = guestContactSchema.parse(input);
  const prisma = getPrisma();
  const fallback = await getSiteSettings();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('guest-contact-settings'))`;
    const row = await tx.settings.findUnique({ where: { key: "settings" } });
    const current = (row?.value ?? fallback) as Record<string, unknown>;
    const value = JSON.parse(JSON.stringify({ ...current, guestContact }));
    await tx.settings.upsert({ where: { key: "settings" }, create: { key: "settings", value }, update: { value } });
  });
  revalidatePath("/admin/settings");
  revalidatePath("/admin");
  revalidatePath("/admin/bookings");
  revalidatePath("/");
}

export async function saveTheme(theme: { preset: string; accent: string }): Promise<void> {
  await guard();
  const parsed = validateThemeMutation(theme);
  const prisma = getPrisma();
  const row = await prisma.settings.findUnique({ where: { key: "theme" } });
  const current = (row?.value ?? {}) as Record<string, unknown>;
  await prisma.settings.upsert({
    where: { key: "theme" },
    create: { key: "theme", value: JSON.parse(JSON.stringify({ ...current, ...parsed })) },
    update: { value: JSON.parse(JSON.stringify({ ...current, ...parsed })) },
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
  const parsed = validateBackgroundMutation(input);
  const prisma = getPrisma();
  const row = await prisma.settings.findUnique({ where: { key: "theme" } });
  const current = (row?.value ?? {}) as { background?: { image?: string } } & Record<string, unknown>;
  const oldImage = current.background?.image;

  await prisma.settings.upsert({
    where: { key: "theme" },
    create: { key: "theme", value: JSON.parse(JSON.stringify({ ...current, background: parsed })) },
    update: { value: JSON.parse(JSON.stringify({ ...current, background: parsed })) },
  });

  // Старый файл удаляем ТОЛЬКО после успешной записи нового состояния
  if (oldImage && oldImage !== parsed.image) {
    try {
      const { unlink } = await import("node:fs/promises");
      const abs = resolveContentPath(oldImage);
      if (abs) {
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

const pricingSchema = z.object({
  globalMode: z.enum(["yandex", "manual", "coefficient"]),
  // Коэффициент ниже -100% дал бы отрицательные цены — запрещаем (BUG-022)
  globalPercent: z.number().min(-100).max(500),
});

export async function savePricing(pricing: { globalMode: string; globalPercent: number }): Promise<void> {
  await guard();
  const parsed = pricingSchema.parse(pricing);
  const prisma = getPrisma();
  const row = await prisma.settings.findUnique({ where: { key: "settings" } });
  const current = (row?.value ?? {}) as Record<string, unknown>;
  await prisma.settings.upsert({
    where: { key: "settings" },
    create: { key: "settings", value: JSON.parse(JSON.stringify({ ...current, pricing: parsed })) },
    update: { value: JSON.parse(JSON.stringify({ ...current, pricing: parsed })) },
  });
  const { recomputePrices } = await import("@/lib/order/recompute");
  await recomputePrices(prisma);
  revalidatePath("/admin/settings");
  revalidatePath("/admin/menu");
  revalidatePath("/menu");
  revalidatePath("/");
}
