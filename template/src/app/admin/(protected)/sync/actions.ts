"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/db";
import { isAdmin } from "@/lib/admin-auth";
import { syncMenu } from "@/lib/yandex-eda/sync";
import type { ContentSettings } from "@/lib/content-schema";

async function guard() {
  if (!(await isAdmin())) throw new Error("Forbidden");
}

export async function saveSyncSettings(input: ContentSettings["sync"], expectedRev?: number | null, force = false): Promise<number | "conflict"> {
  await guard();
  const prisma = getPrisma();
  // F04: та же защита от параллельных правок, что у saveSettings — секция
  // «Импорт» больше не перезаписывает более свежую версию молча. Атомарная
  // запись через общую точку и возврат новой ревизии (аудит 11.10).
  const { writeSettingsVersioned } = await import("@/lib/admin-settings-version");
  const rev = await writeSettingsVersioned(prisma, (current) => ({ ...current, sync: input }), expectedRev ?? null, force);
  if (rev === "conflict") return "conflict";
  revalidatePath("/admin/sync");
  return rev;
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
