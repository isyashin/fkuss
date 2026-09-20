"use server";

import { revalidatePath } from "next/cache";
import { getPrisma } from "@/lib/db";
import { isAdmin } from "@/lib/admin-auth";

async function guard() {
  if (!(await isAdmin())) throw new Error("Forbidden");
}

export interface BanquetsSettings {
  enabled: boolean;
  title: string;
  description: string;
  conditions: string;
  pricesText: string;
  contactPhone: string;
  ctaText: string;
  ctaUrl: string;
}

export async function saveBanquetsSettings(input: BanquetsSettings): Promise<void> {
  await guard();
  const prisma = getPrisma();
  const row = await prisma.settings.findUnique({ where: { key: "settings" } });
  const current = (row?.value ?? {}) as Record<string, unknown>;
  await prisma.settings.upsert({
    where: { key: "settings" },
    create: { key: "settings", value: JSON.parse(JSON.stringify({ ...current, banquets: input })) },
    update: { value: JSON.parse(JSON.stringify({ ...current, banquets: input })) },
  });
  revalidatePath("/admin/banquets");
  revalidatePath("/banquets");
  revalidatePath("/");
}

export async function saveHall(input: {
  id?: string;
  name: string;
  capacity: string;
  description: string;
  image?: string;
}): Promise<string> {
  await guard();
  const prisma = getPrisma();
  const id = input.id ?? `hall-${Date.now().toString(36)}`;
  const max = await prisma.banquetHall.aggregate({ _max: { position: true } });
  await prisma.banquetHall.upsert({
    where: { id },
    create: {
      id,
      name: input.name,
      capacity: input.capacity,
      description: input.description,
      image: input.image ?? "",
      position: (max._max.position ?? -1) + 1,
    },
    update: {
      name: input.name,
      capacity: input.capacity,
      description: input.description,
      ...(input.image !== undefined ? { image: input.image } : {}),
    },
  });
  revalidatePath("/admin/banquets");
  revalidatePath("/banquets");
  return id;
}

export async function deleteHall(id: string): Promise<void> {
  await guard();
  const prisma = getPrisma();
  await prisma.banquetHall.delete({ where: { id } });
  revalidatePath("/admin/banquets");
  revalidatePath("/banquets");
}
