/**
 * seed.ts — наполнение БД из content/ с zod-валидацией.
 * Запуск: npm run seed
 * Идемпотентен: контентные таблицы полностью пересоздаются из content/.
 * Заодно: бэкфилл карточных размеров (-sm.webp) для старых фото блюд.
 */
import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  restaurantSchema,
  menuSchema,
  promosSchema,
  pagesSchema,
  settingsSchema,
  themeSchema,
} from "../src/lib/content-schema";
import { assertContentReadiness } from "../src/lib/content-readiness";

const CONTENT_DIR = process.env.CONTENT_DIR
  ? path.resolve(process.env.CONTENT_DIR)
  : path.join(process.cwd(), "content");

async function readAndValidate<T>(file: string, schema: { parse: (v: unknown) => T }): Promise<T> {
  // BOM (Windows-редакторы) срезаем — иначе JSON.parse падает
  const raw = (await readFile(path.join(CONTENT_DIR, file), "utf-8")).replace(/^﻿/, "");
  try {
    return schema.parse(JSON.parse(raw));
  } catch (error) {
    console.error(`\n❌ Ошибка валидации content/${file}:`);
    if (error instanceof Error && "issues" in error) {
      for (const issue of (error as { issues: { path: (string | number)[]; message: string }[] }).issues) {
        console.error(`  • ${issue.path.join(".")}: ${issue.message}`);
      }
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

async function main() {
  console.log("Читаю content/…");
  const restaurant = await readAndValidate("restaurant.json", restaurantSchema);
  const menu = await readAndValidate("menu.json", menuSchema);
  const promos = await readAndValidate("promos.json", promosSchema);
  const pages = await readAndValidate("pages.json", pagesSchema);
  const settings = await readAndValidate("settings.json", settingsSchema);
  const theme = await readAndValidate("theme.json", themeSchema);
  await assertContentReadiness(CONTENT_DIR, { restaurant, menu, promos, theme, settings });

  // Уникальность id блюд и модификаторов
  const dishIds = new Set<string>();
  for (const category of menu.categories) {
    for (const dish of category.dishes) {
      if (dishIds.has(dish.id)) {
        console.error(`❌ Дублируется id блюда: ${dish.id}`);
        process.exit(1);
      }
      dishIds.add(dish.id);
    }
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const dishesCount = menu.categories.reduce((n, c) => n + c.dishes.length, 0);
  console.log(`Ресторан: ${restaurant.name} (${restaurant.slug})`);
  console.log(`Категорий: ${menu.categories.length}, блюд: ${dishesCount}, акций: ${promos.promos.length}`);

  await prisma.$transaction(async (tx) => {
    // Контентные таблицы пересоздаём из content/.
    // Заказы/клиентов/бонусы НЕ трогаем — это бизнес-данные.
    await tx.modifier.deleteMany();
    await tx.modifierGroup.deleteMany();
    await tx.dish.deleteMany();
    await tx.category.deleteMany();
    await tx.promo.deleteMany();
    await tx.page.deleteMany();
    await tx.settings.deleteMany();

    // Дефолтный вариант доставки из зон (обратная совместимость, если пусто)
    const optionsCount = await tx.deliveryOption.count();
    if (optionsCount === 0 && settings.delivery.enabled && settings.delivery.zones.length > 0) {
      const zone = settings.delivery.zones[0];
      await tx.deliveryOption.create({
        data: {
          id: "courier-default",
          name: "Курьер",
          mode: "asap",
          enabled: true,
          days: [0, 1, 2, 3, 4, 5, 6],
          hoursFrom: restaurant.workHours[0]?.from ?? "10:00",
          hoursTo: restaurant.workHours[0]?.to ?? "23:00",
          price: zone.price,
          freeFrom: zone.freeFrom,
          position: 0,
        },
      });
    }

    for (const [ci, category] of menu.categories.entries()) {
      // BUG-011: externalId категории из cat-<num> (инжест)
      const catExt = category.id.match(/^cat-(\d+)$/);
      await tx.category.create({
        data: {
          id: category.id,
          name: category.name,
          position: ci,
          externalId: catExt ? catExt[1] : null,
        },
      });
      for (const [di, dish] of category.dishes.entries()) {
        // Внешние ID инжеста (dish-<num>, mod-<num>) → source=yandex
        const extMatch = dish.id.match(/^dish-(\d+)$/);
        const externalId = extMatch ? extMatch[1] : null;
        await tx.dish.create({
          data: {
            id: dish.id,
            categoryId: category.id,
            name: dish.name,
            description: dish.description,
            composition: dish.composition ?? "",
            price: dish.price,
            image: dish.image,
            weight: dish.weight,
            tags: dish.tags,
            available: dish.available,
            position: di,
            source: externalId ? "yandex" : "manual",
            externalId,
            yandexAvailable: dish.available,
            manualAvailable: true,
            yandexPrice: externalId ? dish.price : null,
            modifiers: {
              create: dish.modifiers.map((m) => {
                const mExt = m.id.match(/^mod-(\d+)$/);
                return {
                  id: `${dish.id}:${m.id}`,
                  externalId: mExt ? mExt[1] : null,
                  name: m.name,
                  price: m.price,
                  yandexPrice: mExt ? m.price : null,
                };
              }),
            },
          },
        });

        // Группы модификаторов (с min/max); externalId из group-<num>/mod-<num>
        for (const [gi, group] of dish.groups.entries()) {
          const gExt = group.id.match(/^group-(\d+)$/);
          const groupId = gExt ? `${dish.id}:g${gExt[1]}` : `${dish.id}:${group.id}`;
          await tx.modifierGroup.create({
            data: {
              id: groupId,
              dish: { connect: { id: dish.id } },
              externalId: gExt ? gExt[1] : null,
              name: group.name,
              position: group.position ?? gi,
              minSelected: group.minSelected,
              maxSelected: group.maxSelected,
              modifiers: {
                create: group.modifiers.map((m) => {
                  const mExt = m.id.match(/^mod-(\d+)$/);
                  return {
                    id: gExt && mExt
                      ? `${dish.id}:g${gExt[1]}:o${mExt[1]}`
                      : `${dish.id}:${group.id}:${m.id}`,
                    dish: { connect: { id: dish.id } },
                    externalId: mExt ? mExt[1] : null,
                    name: m.name,
                    price: m.price,
                    yandexPrice: mExt ? m.price : null,
                  };
                }),
              },
            },
          });
        }
      }
    }

    for (const [i, promo] of promos.promos.entries()) {
      await tx.promo.create({
        data: {
          id: promo.id,
          title: promo.title,
          text: promo.text,
          image: promo.image,
          activeFrom: promo.activeFrom,
          activeTo: promo.activeTo,
          position: i,
        },
      });
    }

    for (const page of pages.pages) {
      await tx.page.create({ data: { slug: page.slug, title: page.title, body: page.body } });
    }

    const settingsEntries: [string, unknown][] = [
      ["restaurant", restaurant],
      ["settings", settings],
      ["theme", theme],
    ];
    for (const [key, value] of settingsEntries) {
      await tx.settings.create({ data: { key, value: JSON.parse(JSON.stringify(value)) } });
    }
  });

  console.log("✓ Seed завершён");

  // PWA-иконки из логотипа (или fallback платформы)
  try {
    const { generateIcons } = await import("../src/lib/pwa-icons");
    const result = await generateIcons(CONTENT_DIR, restaurant, theme.accent);
    console.log(`  PWA-иконки: ${result.icons.length}, версия ${result.version}`);
  } catch (error) {
    console.warn("  ! PWA-иконки не сгенерированы:", error instanceof Error ? error.message : error);
  }

  // Бэкфилл -sm.webp для фото, у которых есть только полная версия
  try {
    const dishesDir = path.join(CONTENT_DIR, "images", "dishes");
    const files = await readdir(dishesDir);
    const fulls = files.filter((f) => f.endsWith(".webp") && !f.endsWith("-sm.webp"));
    let generated = 0;
    const sharp = (await import("sharp")).default;
    for (const f of fulls) {
      const smName = f.replace(/\.webp$/, "-sm.webp");
      if (files.includes(smName)) continue;
      const buffer = await readFile(path.join(dishesDir, f));
      await writeFile(
        path.join(dishesDir, smName),
        await sharp(buffer).resize(400, 400, { fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer(),
      );
      generated++;
    }
    if (generated > 0) console.log(`  Карточных размеров создано: ${generated}`);
  } catch {
    // нет папки с блюдами — не страшно
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("❌ Seed упал:", error);
  process.exit(1);
});
