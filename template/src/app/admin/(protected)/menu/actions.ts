"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getPrisma } from "@/lib/db";
import { isAdmin } from "@/lib/admin-auth";

async function guard() {
  if (!(await isAdmin())) throw new Error("Forbidden");
}

const updateDishSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  price: z.number().int().min(0).max(1000000).optional(),
  description: z.string().max(2000).optional(),
  available: z.boolean().optional(),
  manualAvailable: z.boolean().optional(),
  weight: z.string().max(50).optional(),
  priceMode: z.enum(["inherit", "yandex", "manual", "coefficient"]).optional(),
  manualPrice: z.number().int().min(0).max(1000000).nullable().optional(),
  coefficientPercent: z.number().min(-100).max(500).nullable().optional(),
});

export async function updateDish(
  id: string,
  data: {
    name?: string;
    price?: number;
    description?: string;
    available?: boolean;
    manualAvailable?: boolean;
    weight?: string;
    priceMode?: "inherit" | "yandex" | "manual" | "coefficient";
    manualPrice?: number | null;
    coefficientPercent?: number | null;
  },
): Promise<void> {
  await guard();
  const parsed = updateDishSchema.parse(data);
  const prisma = getPrisma();
  const { manualAvailable, ...rest } = parsed;
  const dish = await prisma.dish.findUnique({ where: { id } });
  if (!dish) throw new Error("Блюдо не найдено");

  const update: Record<string, unknown> = { ...rest };
  if (manualAvailable !== undefined) {
    // BUG-007: ручной рубильник меняет manualAvailable; итог пересчитываем
    update.manualAvailable = manualAvailable;
    update.available = manualAvailable && dish.yandexAvailable;
  }

  await prisma.dish.update({ where: { id }, data: update });
  const { recomputePrices } = await import("@/lib/order/recompute");
  await recomputePrices(prisma);
  revalidatePath("/admin/menu");
  revalidatePath("/menu");
  revalidatePath("/");
}

export async function addDish(input: {
  categoryId: string;
  name: string;
  price: number;
  description?: string;
  weight?: string;
}): Promise<string> {
  await guard();
  const prisma = getPrisma();
  const id = `${input.categoryId}-${Date.now().toString(36)}`;
  await prisma.dish.create({
    data: {
      id,
      categoryId: input.categoryId,
      name: input.name,
      price: input.price,
      description: input.description ?? "",
      weight: input.weight ?? "",
      image: "",
      tags: [],
    },
  });
  revalidatePath("/admin/menu");
  revalidatePath("/menu");
  return id;
}

export async function deleteDish(id: string): Promise<void> {
  await guard();
  const prisma = getPrisma();
  // BUG-022: сначала модификаторы (в т.ч. групповые), потом группы, потом блюдо
  const groups = await prisma.modifierGroup.findMany({ where: { dishId: id }, select: { id: true } });
  if (groups.length > 0) {
    const groupIds = groups.map((g) => g.id);
    await prisma.modifier.deleteMany({ where: { groupId: { in: groupIds } } });
    await prisma.modifierGroup.deleteMany({ where: { id: { in: groupIds } } });
  }
  await prisma.modifier.deleteMany({ where: { dishId: id } });
  await prisma.dish.delete({ where: { id } });
  revalidatePath("/admin/menu");
  revalidatePath("/menu");
}

export async function addCategory(name: string): Promise<void> {
  await guard();
  const prisma = getPrisma();
  const id = `cat-${Date.now().toString(36)}`;
  const max = await prisma.category.aggregate({ _max: { position: true } });
  await prisma.category.create({
    data: { id, name, position: (max._max.position ?? -1) + 1 },
  });
  revalidatePath("/admin/menu");
  revalidatePath("/menu");
}
