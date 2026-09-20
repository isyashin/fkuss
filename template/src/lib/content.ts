import { readFile } from "node:fs/promises";
import path from "node:path";
import { cache } from "react";

const CONTENT_DIR = path.join(process.cwd(), "content");

async function readJson<T>(file: string): Promise<T> {
  const raw = await readFile(path.join(CONTENT_DIR, file), "utf-8");
  return JSON.parse(raw) as T;
}

export interface WorkHours {
  days: string;
  from: string;
  to: string;
}

export interface Restaurant {
  name: string;
  slug: string;
  cuisine: string;
  phone: string;
  email: string;
  address: string;
  workHours: WorkHours[];
  socials: { telegram: string; max: string; whatsapp: string; vk: string };
  seo: { title: string; description: string };
  logo: string;
}

export interface Modifier {
  id: string;
  name: string;
  price: number;
}

export interface ModifierGroup {
  id: string;
  name: string;
  minSelected: number;
  maxSelected: number;
  modifiers: Modifier[];
}

export interface Dish {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  weight: string;
  tags: string[];
  modifiers: Modifier[];
  groups?: ModifierGroup[];
  available: boolean;
}

export interface MenuCategory {
  id: string;
  name: string;
  dishes: Dish[];
}

export interface Menu {
  categories: MenuCategory[];
}

export interface ThemeConfig {
  preset: "warm" | "minimal" | "elegant";
  accent: string;
  fontHeading: string;
  fontBody: string;
  radius: "sharp" | "soft" | "round";
  dark: boolean;
  homeBlocks: string[];
}

export interface Promo {
  id: string;
  title: string;
  text: string;
  image: string;
  activeFrom: string;
  activeTo: string | null;
}

export const getRestaurant = cache(() => readJson<Restaurant>("restaurant.json"));
export const getMenu = cache(() => readJson<Menu>("menu.json"));
export const getTheme = cache(() => readJson<ThemeConfig>("theme.json"));
export const getPromos = cache(() => readJson<{ promos: Promo[] }>("promos.json"));
export const getPages = cache(() =>
  readJson<{ pages: { slug: string; title: string; body: string }[] }>("pages.json"),
);

/** Путь к файлу внутри content/ для отдачи как статики через /content-asset */
export function contentAssetUrl(relPath: string): string {
  return `/content-asset/${relPath}`;
}
