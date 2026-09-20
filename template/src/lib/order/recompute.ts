/**
 * Пересчёт цен в БД из резолвера: Dish.price и Modifier.price — единственные
 * значения, которые видят сервер заказа и витрина.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { resolveDishPrice, resolveModifierPrice, type PriceSettings } from "./price-resolver";

type PrismaLike = Pick<PrismaClient, "dish" | "modifier" | "settings">;

export async function getPriceSettings(prisma: PrismaLike): Promise<PriceSettings> {
  const row = await prisma.settings.findUnique({ where: { key: "settings" } });
  const value = (row?.value ?? {}) as { pricing?: PriceSettings };
  return value.pricing ?? { globalMode: "yandex", globalPercent: 0 };
}

/** Полный пересчёт цен меню по текущим настройкам */
export async function recomputePrices(prisma: PrismaLike): Promise<{ dishes: number; modifiers: number }> {
  const settings = await getPriceSettings(prisma);

  const dishes = await prisma.dish.findMany();
  let dishCount = 0;
  for (const d of dishes) {
    const price = resolveDishPrice(
      { ...d, priceMode: d.priceMode as "inherit" | "yandex" | "manual" | "coefficient" },
      settings,
    );
    if (price !== d.price) {
      await prisma.dish.update({ where: { id: d.id }, data: { price } });
      dishCount++;
    }
  }

  const modifiers = await prisma.modifier.findMany();
  let modCount = 0;
  for (const m of modifiers) {
    const price = resolveModifierPrice(m, settings);
    if (price !== m.price) {
      await prisma.modifier.update({ where: { id: m.id }, data: { price } });
      modCount++;
    }
  }

  return { dishes: dishCount, modifiers: modCount };
}
