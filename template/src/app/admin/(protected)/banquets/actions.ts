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
  // Единая точка записи строки settings: общая блокировка и бамп _rev
  // (P1, аудит 11.10) — правка банкетов не должна тихо теряться чужим
  // полным объектом из устаревшей вкладки.
  const { writeSettingsVersioned } = await import("@/lib/admin-settings-version");
  await writeSettingsVersioned(prisma, (current) => ({ ...current, banquets: input }), null);
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
  images?: string[];
}): Promise<string> {
  await guard();
  const prisma = getPrisma();
  const id = input.id ?? `hall-${Date.now().toString(36)}`;
  const max = await prisma.banquetHall.aggregate({ _max: { position: true } });
  const images = input.images ?? (input.image ? [input.image] : undefined);
  await prisma.banquetHall.upsert({
    where: { id },
    create: {
      id,
      name: input.name,
      capacity: input.capacity,
      description: input.description,
      image: input.image ?? images?.[0] ?? "",
      images: images ?? [],
      position: (max._max.position ?? -1) + 1,
    },
    update: {
      name: input.name,
      capacity: input.capacity,
      description: input.description,
      ...(images !== undefined ? { images, image: images[0] ?? "" } : input.image !== undefined ? { image: input.image } : {}),
    },
  });
  revalidatePath("/admin/banquets");
  revalidatePath("/banquets");
  return id;
}

/** Добавить фото в галерею зала (в конец массива) */
export async function addHallImage(hallId: string, image: string): Promise<void> {
  await guard();
  const prisma = getPrisma();
  const hall = await prisma.banquetHall.findUnique({ where: { id: hallId } });
  if (!hall) throw new Error("Зал не найден");
  const images = [...hall.images, image];
  await prisma.banquetHall.update({
    where: { id: hallId },
    data: { images, image: hall.image || image },
  });
  revalidatePath("/admin/banquets");
  revalidatePath("/banquets");
}

/** Удалить фото из галереи зала */
export async function removeHallImage(hallId: string, image: string): Promise<void> {
  await guard();
  const prisma = getPrisma();
  const hall = await prisma.banquetHall.findUnique({ where: { id: hallId } });
  if (!hall) return;
  const images = hall.images.filter((i) => i !== image);
  await prisma.banquetHall.update({
    where: { id: hallId },
    data: { images, image: images[0] ?? "" },
  });
  revalidatePath("/admin/banquets");
  revalidatePath("/banquets");
}

export async function deleteHall(id: string): Promise<void> {
  await guard();
  const prisma = getPrisma();
  await prisma.banquetHall.delete({ where: { id } });
  revalidatePath("/admin/banquets");
  revalidatePath("/banquets");
}
