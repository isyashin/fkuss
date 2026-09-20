"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/db";
import { isAdmin } from "@/lib/admin-auth";
import { syncMenu } from "@/lib/yandex-eda/sync";
import type { ContentSettings } from "@/lib/content-schema";

async function guard() {
  if (!(await isAdmin())) throw new Error("Forbidden");
}

export async function saveSyncSettings(input: ContentSettings["sync"]): Promise<void> {
  await guard();
  const prisma = getPrisma();
  const row = await prisma.settings.findUnique({ where: { key: "settings" } });
  const current = (row?.value ?? {}) as Record<string, unknown>;
  await prisma.settings.upsert({
    where: { key: "settings" },
    create: { key: "settings", value: JSON.parse(JSON.stringify({ ...current, sync: input })) },
    update: { value: JSON.parse(JSON.stringify({ ...current, sync: input })) },
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
