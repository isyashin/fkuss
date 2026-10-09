"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/db";
import { isAdmin } from "@/lib/admin-auth";
import { syncMenu } from "@/lib/yandex-eda/sync";
import type { ContentSettings } from "@/lib/content-schema";

async function guard() {
  if (!(await isAdmin())) throw new Error("Forbidden");
}

export async function saveSyncSettings(input: ContentSettings["sync"], expectedRev?: number | null, force = false): Promise<void> {
  await guard();
  const prisma = getPrisma();
  // F04: та же защита от параллельных правок, что у saveSettings — секция
  // «Импорт» больше не перезаписывает более свежую версию молча.
  const { assertSettingsRev } = await import("@/lib/admin-settings-version");
  const row = await prisma.settings.findUnique({ where: { key: "settings" } });
  const nextRev = assertSettingsRev(row?.value ?? null, expectedRev ?? null, force);
  const current = (row?.value ?? {}) as Record<string, unknown>;
  const value = JSON.parse(JSON.stringify({ ...current, sync: input, _rev: nextRev }));
  await prisma.settings.upsert({
    where: { key: "settings" },
    create: { key: "settings", value },
    update: { value },
  });
  revalidatePath("/admin/sync");
}

export async function runSyncNow(): Promise<{ ok: boolean; error?: string; upserted?: number; missing?: number }> {
  await guard();
  const prisma = getPrisma();
  const result = await syncMenu(prisma);
  revalidatePath("/admin/sync");
  revalidatePath("/menu");
  revalidatePath("/");
  return result;
}
