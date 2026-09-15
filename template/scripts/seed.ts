/**
 * seed.ts — наполнение БД из content/ с zod-валидацией.
 * Запуск: npm run seed
 * Идемпотентен: контентные таблицы полностью пересоздаются из content/.
 */
import { readFile } from "node:fs/promises";
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

const CONTENT_DIR = process.env.CONTENT_DIR
  ? path.resolve(process.env.CONTENT_DIR)
  : path.join(process.cwd(), "content");

async function readAndValidate<T>(file: string, schema: { parse: (v: unknown) => T }): Promise<T> {
  const raw = await readFile(path.join(CONTENT_DIR, file), "utf-8");
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
    await tx.dish.deleteMany();
    await tx.category.deleteMany();
    await tx.promo.deleteMany();
    await tx.page.deleteMany();
    await tx.settings.deleteMany();

    for (const [ci, category] of menu.categories.entries()) {
      await tx.category.create({
        data: { id: category.id, name: category.name, position: ci },
      });
      for (const [di, dish] of category.dishes.entries()) {
        await tx.dish.create({
          data: {
            id: dish.id,
            categoryId: category.id,
            name: dish.name,
            description: dish.description,
            price: dish.price,
            image: dish.image,
            weight: dish.weight,
            tags: dish.tags,
            available: dish.available,
            position: di,
            modifiers: {
              create: dish.modifiers.map((m) => ({ id: `${dish.id}:${m.id}`, name: m.name, price: m.price })),
            },
          },
        });
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
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("❌ Seed упал:", error);
  process.exit(1);
});
