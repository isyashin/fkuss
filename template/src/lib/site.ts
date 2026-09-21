/**
 * Данные витрины: сначала из БД (после seed / правок админки),
 * fallback — из content/*.json (до первого seed).
 */
import { getPrisma } from "./db";
import {
  getRestaurant as readRestaurant,
  getMenu as readMenu,
  getTheme as readTheme,
  getPromos as readPromos,
  getPages as readPages,
  type Restaurant,
  type Menu,
  type ThemeConfig,
  type Promo,
} from "./content";
import type { ContentSettings } from "./content-schema";

export { contentAssetUrl } from "./assets";

export async function getSiteRestaurant(): Promise<Restaurant> {
  try {
    const prisma = getPrisma();
    const row = await prisma.settings.findUnique({ where: { key: "restaurant" } });
    if (row) return row.value as unknown as Restaurant;
  } catch {
    // БД недоступна — читаем из content/
  }
  return readRestaurant();
}

export async function getSiteTheme(): Promise<ThemeConfig> {
  try {
    const prisma = getPrisma();
    const row = await prisma.settings.findUnique({ where: { key: "theme" } });
    if (row) return row.value as unknown as ThemeConfig;
  } catch {
    // fallback ниже
  }
  return readTheme();
}

export async function getSiteSettings(): Promise<ContentSettings> {
  try {
    const prisma = getPrisma();
    const row = await prisma.settings.findUnique({ where: { key: "settings" } });
    if (row) return row.value as unknown as ContentSettings;
  } catch {
    // fallback ниже
  }
  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const raw = await readFile(path.join(process.cwd(), "content", "settings.json"), "utf-8");
  return JSON.parse(raw) as ContentSettings;
}

export async function getSiteMenu(): Promise<Menu> {
  try {
    const prisma = getPrisma();
    const categories = await prisma.category.findMany({
      orderBy: { position: "asc" },
      include: {
        dishes: {
          orderBy: { position: "asc" },
          include: {
            modifiers: true,
            modifierGroups: { orderBy: { position: "asc" }, include: { modifiers: true } },
          },
        },
      },
    });
    if (categories.length > 0) {
      return {
        categories: categories.map((c) => ({
          id: c.id,
          name: c.name,
          dishes: c.dishes.map((d) => ({
            id: d.id,
            name: d.name,
            description: d.description,
            price: d.price,
            image: d.image,
            weight: d.weight,
            tags: d.tags,
            // BUG-004: в flat-блоке «Добавки» — только модификаторы БЕЗ группы,
            // иначе каждый соус дублируется дважды (в блоке и в группе)
            modifiers: d.modifiers
              .filter((m) => m.groupId === null)
              .map((m) => ({ id: m.id, name: m.name, price: m.price })),
            groups: d.modifierGroups.map((g) => ({
              id: g.id,
              name: g.name,
              minSelected: g.minSelected,
              maxSelected: g.maxSelected,
              modifiers: g.modifiers.map((m) => ({ id: m.id, name: m.name, price: m.price })),
            })),
            available: d.available,
          })),
        })),
      };
    }
  } catch {
    // fallback ниже
  }
  return readMenu();
}

export async function getSitePromos(): Promise<{ promos: Promo[] }> {
  try {
    const prisma = getPrisma();
    const promos = await prisma.promo.findMany({ orderBy: { position: "asc" } });
    if (promos.length > 0) {
      return {
        promos: promos.map((p) => ({
          id: p.id,
          title: p.title,
          text: p.text,
          image: p.image,
          activeFrom: p.activeFrom ?? "",
          activeTo: p.activeTo,
        })),
      };
    }
  } catch {
    // fallback ниже
  }
  return readPromos();
}

export async function getSitePages() {
  try {
    const prisma = getPrisma();
    const pages = await prisma.page.findMany();
    if (pages.length > 0) return { pages };
  } catch {
    // fallback ниже
  }
  return readPages();
}
