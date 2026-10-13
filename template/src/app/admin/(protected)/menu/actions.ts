"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getPrisma } from "@/lib/db";
import { isAdmin } from "@/lib/admin-auth";
import { parseAdminInput, adminIdSchema, adminMoneySchema, adminPercentSchema, adminShortTextSchema, adminTextSchema } from "@/lib/admin-validation";
import { assertCategoryDeletable, categoryReorderUpdates } from "@/lib/menu-categories";
import { assertModifierGroupLimits, requiredToMinSelected } from "@/lib/menu-modifiers";

async function guard() {
  if (!(await isAdmin("menu"))) throw new Error("Forbidden");
}

export type ModifierActionResult = { ok: true } | { ok: false; error: string };

/* Ошибки server actions в production доходят до клиента без текста (только digest),
   поэтому ожидаемые ошибки возвращаем значением, а не бросаем (как в team/actions). */
function toModifierErrorResult(error: unknown, fallback: string): { ok: false; error: string } {
  if (error instanceof z.ZodError) {
    return { ok: false, error: error.issues[0]?.message ?? fallback };
  }
  if (error instanceof Error && error.message) {
    return { ok: false, error: error.message };
  }
  return { ok: false, error: fallback };
}

async function modifierGuard(): Promise<ModifierActionResult | null> {
  if (!(await isAdmin("menu"))) return { ok: false, error: "Недостаточно прав" };
  return null;
}

function revalidateMenu(): void {
  revalidatePath("/admin/menu");
  revalidatePath("/menu");
  revalidatePath("/");
}

const modifierGroupInputSchema = z.object({
  name: adminShortTextSchema,
  required: z.boolean(),
  maxSelected: z.number().finite().int().min(1).max(99),
});

const modifierInputSchema = z.object({
  name: adminShortTextSchema,
  price: adminMoneySchema,
});

export async function addModifierGroup(
  dishId: string,
  input: { name: string; required: boolean; maxSelected: number },
): Promise<ModifierActionResult & { id?: string }> {
  const denied = await modifierGuard();
  if (denied) return denied;
  const prisma = getPrisma();
  try {
    parseAdminInput(adminIdSchema, dishId);
    const parsed = parseAdminInput(modifierGroupInputSchema, input);
    const dish = await prisma.dish.findUnique({ where: { id: dishId }, select: { id: true } });
    if (!dish) return { ok: false, error: "Блюдо не найдено" };
    assertModifierGroupLimits(requiredToMinSelected(parsed.required), parsed.maxSelected);
    const max = await prisma.modifierGroup.aggregate({ where: { dishId }, _max: { position: true } });
    const id = `mg-${Date.now().toString(36)}`;
    await prisma.modifierGroup.create({
      data: {
        id,
        dishId,
        name: parsed.name,
        position: (max._max.position ?? -1) + 1,
        minSelected: requiredToMinSelected(parsed.required),
        maxSelected: parsed.maxSelected,
      },
    });
    revalidateMenu();
    return { ok: true, id };
  } catch (error) {
    return toModifierErrorResult(error, "Не удалось добавить группу");
  }
}

export async function updateModifierGroup(
  groupId: string,
  input: { name?: string; required?: boolean; maxSelected?: number },
): Promise<ModifierActionResult> {
  const denied = await modifierGuard();
  if (denied) return denied;
  const prisma = getPrisma();
  try {
    parseAdminInput(adminIdSchema, groupId);
    const parsed = parseAdminInput(modifierGroupInputSchema.partial(), input);
    const group = await prisma.modifierGroup.findUnique({ where: { id: groupId } });
    if (!group) return { ok: false, error: "Группа не найдена" };
    const minSelected = parsed.required === undefined ? group.minSelected : requiredToMinSelected(parsed.required);
    const maxSelected = parsed.maxSelected ?? group.maxSelected;
    assertModifierGroupLimits(minSelected, maxSelected);
    await prisma.modifierGroup.update({
      where: { id: groupId },
      data: {
        ...(parsed.name !== undefined ? { name: parsed.name } : {}),
        minSelected,
        maxSelected,
      },
    });
    revalidateMenu();
    return { ok: true };
  } catch (error) {
    return toModifierErrorResult(error, "Не удалось сохранить группу");
  }
}

export async function deleteModifierGroup(groupId: string): Promise<ModifierActionResult> {
  const denied = await modifierGuard();
  if (denied) return denied;
  const prisma = getPrisma();
  try {
    parseAdminInput(adminIdSchema, groupId);
    const group = await prisma.modifierGroup.findUnique({ where: { id: groupId }, select: { id: true } });
    if (!group) return { ok: false, error: "Группа не найдена" };
    // Сначала модификаторы (FK), затем сама группа
    await prisma.modifier.deleteMany({ where: { groupId } });
    await prisma.modifierGroup.delete({ where: { id: groupId } });
    revalidateMenu();
    return { ok: true };
  } catch (error) {
    return toModifierErrorResult(error, "Не удалось удалить группу");
  }
}

export async function addModifier(
  dishId: string,
  groupId: string,
  input: { name: string; price: number },
): Promise<ModifierActionResult & { id?: string }> {
  const denied = await modifierGuard();
  if (denied) return denied;
  const prisma = getPrisma();
  try {
    parseAdminInput(adminIdSchema, dishId);
    parseAdminInput(adminIdSchema, groupId);
    const parsed = parseAdminInput(modifierInputSchema, input);
    const group = await prisma.modifierGroup.findUnique({ where: { id: groupId }, select: { id: true, dishId: true } });
    if (!group || group.dishId !== dishId) return { ok: false, error: "Группа не найдена" };
    const id = `mod-${Date.now().toString(36)}`;
    // manualPrice = price: ручная надбавка переживает пересчёт цен (resolveModifierPrice)
    await prisma.modifier.create({
      data: { id, dishId, groupId, name: parsed.name, price: parsed.price, manualPrice: parsed.price },
    });
    revalidateMenu();
    return { ok: true, id };
  } catch (error) {
    return toModifierErrorResult(error, "Не удалось добавить вариант");
  }
}

export async function updateModifier(
  modifierId: string,
  input: { name?: string; price?: number },
): Promise<ModifierActionResult> {
  const denied = await modifierGuard();
  if (denied) return denied;
  const prisma = getPrisma();
  try {
    parseAdminInput(adminIdSchema, modifierId);
    const parsed = parseAdminInput(modifierInputSchema.partial(), input);
    const modifier = await prisma.modifier.findUnique({ where: { id: modifierId }, select: { id: true } });
    if (!modifier) return { ok: false, error: "Вариант не найден" };
    await prisma.modifier.update({
      where: { id: modifierId },
      data: {
        ...(parsed.name !== undefined ? { name: parsed.name } : {}),
        ...(parsed.price !== undefined ? { price: parsed.price, manualPrice: parsed.price } : {}),
      },
    });
    revalidateMenu();
    return { ok: true };
  } catch (error) {
    return toModifierErrorResult(error, "Не удалось сохранить вариант");
  }
}

export async function deleteModifier(modifierId: string): Promise<ModifierActionResult> {
  const denied = await modifierGuard();
  if (denied) return denied;
  const prisma = getPrisma();
  try {
    parseAdminInput(adminIdSchema, modifierId);
    const modifier = await prisma.modifier.findUnique({ where: { id: modifierId }, select: { id: true } });
    if (!modifier) return { ok: false, error: "Вариант не найден" };
    await prisma.modifier.delete({ where: { id: modifierId } });
    revalidateMenu();
    return { ok: true };
  } catch (error) {
    return toModifierErrorResult(error, "Не удалось удалить вариант");
  }
}

const updateDishSchema = z.object({
  name: adminShortTextSchema.optional(),
  price: adminMoneySchema.optional(),
  description: adminTextSchema.max(2000).optional(),
  composition: adminTextSchema.max(2000).optional(),
  available: z.boolean().optional(),
  manualAvailable: z.boolean().optional(),
  weight: z.string().max(50).optional(),
  categoryId: adminIdSchema.optional(),
  priceMode: z.enum(["inherit", "yandex", "manual", "coefficient"]).optional(),
  manualPrice: adminMoneySchema.nullable().optional(),
  coefficientPercent: adminPercentSchema.nullable().optional(),
});

export async function updateDish(
  id: string,
  data: {
    name?: string;
    price?: number;
    description?: string;
    composition?: string;
    available?: boolean;
    manualAvailable?: boolean;
    weight?: string;
    categoryId?: string;
    priceMode?: "inherit" | "yandex" | "manual" | "coefficient";
    manualPrice?: number | null;
    coefficientPercent?: number | null;
  },
): Promise<void> {
  await guard();
  parseAdminInput(adminIdSchema, id);
  const parsed = updateDishSchema.parse(data);
  const prisma = getPrisma();
  const { manualAvailable, ...rest } = parsed;
  const dish = await prisma.dish.findUnique({ where: { id } });
  if (!dish) throw new Error("Блюдо не найдено");
  if (parsed.categoryId && parsed.categoryId !== dish.categoryId) {
    const category = await prisma.category.findUnique({ where: { id: parsed.categoryId } });
    if (!category) throw new Error("Категория не найдена");
  }

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
  composition?: string;
  weight?: string;
}): Promise<string> {
  await guard();
  parseAdminInput(z.object({ categoryId: adminIdSchema, name: adminShortTextSchema, price: adminMoneySchema, description: adminTextSchema.max(2000).optional(), composition: adminTextSchema.max(2000).optional(), weight: z.string().max(50).optional() }), input);
  const prisma = getPrisma();
  const id = `${input.categoryId}-${Date.now().toString(36)}`;
  await prisma.dish.create({
    data: {
      id,
      categoryId: input.categoryId,
      name: input.name,
      price: input.price,
      description: input.description ?? "",
      composition: input.composition ?? "",
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
  parseAdminInput(adminIdSchema, id);
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

export async function addCategory(name: string, menuId?: string): Promise<void> {
  await guard();
  parseAdminInput(adminShortTextSchema, name);
  const prisma = getPrisma();
  const id = `cat-${Date.now().toString(36)}`;
  const max = await prisma.category.aggregate({ _max: { position: true } });
  if (menuId) {
    const menu = await prisma.menuGroup.findUnique({ where: { id: menuId } });
    if (!menu) throw new Error("Меню не найдено");
  }
  await prisma.category.create({
    data: { id, name, position: (max._max.position ?? -1) + 1, menuId: menuId || null },
  });
  revalidatePath("/admin/menu");
  revalidatePath("/menu");
}

export async function renameCategory(id: string, name: string): Promise<void> {
  await guard();
  parseAdminInput(adminIdSchema, id);
  parseAdminInput(adminShortTextSchema, name);
  const prisma = getPrisma();
  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) throw new Error("Категория не найдена");
  await prisma.category.update({ where: { id }, data: { name } });
  revalidatePath("/admin/menu");
  revalidatePath("/menu");
  revalidatePath("/");
}

export async function deleteCategory(id: string): Promise<void> {
  await guard();
  parseAdminInput(adminIdSchema, id);
  const prisma = getPrisma();
  const category = await prisma.category.findUnique({ where: { id }, include: { _count: { select: { dishes: true } } } });
  if (!category) throw new Error("Категория не найдена");
  assertCategoryDeletable(category._count.dishes);
  await prisma.category.delete({ where: { id } });
  revalidatePath("/admin/menu");
  revalidatePath("/menu");
  revalidatePath("/");
}

/** Сдвиг категории вверх/вниз внутри её группы меню. */
export async function reorderCategory(id: string, direction: "up" | "down"): Promise<void> {
  await guard();
  parseAdminInput(adminIdSchema, id);
  const prisma = getPrisma();
  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) throw new Error("Категория не найдена");
  const siblings = await prisma.category.findMany({
    where: { menuId: category.menuId },
    orderBy: { position: "asc" },
    select: { id: true, position: true },
  });
  const updates = categoryReorderUpdates(siblings, id, direction);
  if (updates.length === 0) return;
  await prisma.$transaction(updates.map((update) => prisma.category.update({ where: { id: update.id }, data: { position: update.position } })));
  revalidatePath("/admin/menu");
  revalidatePath("/menu");
  revalidatePath("/");
}

/** Перенос категории между группами меню ("" = без группы). */
export async function updateCategoryMenu(id: string, menuId: string): Promise<void> {
  await guard();
  const prisma = getPrisma();
  if (menuId) {
    const menu = await prisma.menuGroup.findUnique({ where: { id: menuId } });
    if (!menu) throw new Error("Меню не найдено");
  }
  await prisma.category.update({ where: { id }, data: { menuId: menuId || null } });
  revalidatePath("/admin/menu");
  revalidatePath("/menu");
}
