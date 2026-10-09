/**
 * Общая загрузка и валидация content/: zod-схемы + readiness + уникальность
 * id блюд. Используется validate-content.ts (CLI) и assemble-content.ts
 * (шаг VALIDATE пайплайна). Без подключения к БД.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  restaurantSchema,
  menuSchema,
  promosSchema,
  pagesSchema,
  settingsSchema,
  themeSchema,
  type ContentRestaurant,
  type ContentMenu,
  type ContentSettings,
  type ContentTheme,
} from "../../src/lib/content-schema";
import { checkContentReadiness } from "../../src/lib/content-readiness";

export interface ValidatedContent {
  restaurant: ContentRestaurant;
  menu: ContentMenu;
  promos: { promos: { id: string; title: string; text: string; image: string; activeFrom: string | null; activeTo: string | null }[] };
  pages: { pages: { slug: string; title: string; body: string }[] };
  settings: ContentSettings;
  theme: ContentTheme;
}

/** Ошибка валидации с человекочитаемым списком issues */
export class ContentValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: string[],
  ) {
    super(message);
  }
}

async function readJson(dir: string, file: string): Promise<unknown> {
  const raw = (await readFile(path.join(dir, file), "utf-8")).replace(/^﻿/, "");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new ContentValidationError(`content/${file}: не валидный JSON`, [
      error instanceof Error ? error.message : String(error),
    ]);
  }
}

function parseWith<T>(file: string, schema: { parse: (v: unknown) => T }, raw: unknown): T {
  try {
    return schema.parse(raw);
  } catch (error) {
    const issues =
      error instanceof Error && "issues" in error
        ? (error as { issues: { path: (string | number)[]; message: string }[] }).issues.map(
            (i) => `${i.path.join(".")}: ${i.message}`,
          )
        : [error instanceof Error ? error.message : String(error)];
    throw new ContentValidationError(`content/${file}: ошибка схемы`, issues);
  }
}

/** Загрузить и провалидировать content/ целиком. Пробрасывает ContentValidationError. */
export async function loadAndValidateContent(dir: string): Promise<ValidatedContent> {
  const restaurant = parseWith("restaurant.json", restaurantSchema, await readJson(dir, "restaurant.json"));
  const menu = parseWith("menu.json", menuSchema, await readJson(dir, "menu.json"));
  const promos = parseWith("promos.json", promosSchema, await readJson(dir, "promos.json"));
  const pages = parseWith("pages.json", pagesSchema, await readJson(dir, "pages.json"));
  const settings = parseWith("settings.json", settingsSchema, await readJson(dir, "settings.json"));
  const theme = parseWith("theme.json", themeSchema, await readJson(dir, "theme.json"));

  // Уникальность id блюд (seed проверяет то же самое)
  const dishIds = new Set<string>();
  for (const category of menu.categories) {
    for (const dish of category.dishes) {
      if (dishIds.has(dish.id)) {
        throw new ContentValidationError("content/menu.json: дублируются id блюд", [`${dish.id} встречается повторно`]);
      }
      dishIds.add(dish.id);
    }
  }

  const readinessErrors = await checkContentReadiness(dir, { restaurant, menu, promos, theme, settings });
  if (readinessErrors.length) {
    throw new ContentValidationError("content: readiness не пройден", readinessErrors);
  }

  return { restaurant, menu, promos, pages, settings, theme };
}
