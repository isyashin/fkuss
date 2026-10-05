/**
 * Инжест меню из Яндекс.Еды → content/ шаблона.
 * Использование: npx tsx scripts/ingest-yandex-eda.ts <url> --out <dir>
 *   [--menu-id <id> --menu-name "<Название>"]   второе меню заведения
 *   [--fixture-dir <dir>]                       offline: catalog.json/menu.json
 *                                               из папки вместо сети (тесты)
 *   [--browser]                                 антибот-фолбэк: Playwright
 *                                               перехватывает те же API
 *
 * Лестница устойчивости (источник выбран — добираем данные, не переключаемся):
 *   1) retry с backoff на сеть/5xx; 2) адаптация под изменившийся API —
 * честная ошибка с диагностикой; 3) фото: перебор размеров под ratio;
 *   4) антибот: --browser (Playwright-рендеринг карточки, капча-сервисы
 * и чужие сессии запрещены); 5) частичный фейл — продолжаем с пометками;
 *   6) полный фейл — диагностический отчёт и exit 1.
 */
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { menuSchema, restaurantSchema } from "../src/lib/content-schema";
import { writeDishImages, writeLogoPng } from "./lib/dish-images";

const EDA_HOST = "https://eda.yandex.ru";
// Категории-дубли/служебные, которые не переносим
const SKIP_CATEGORIES = new Set(["Что нового", "Выбор пользователей"]);

const RETRY_DELAYS_MS = [1000, 2000, 4000];
/** Диагностический журнал: печатается при полном фейле */
const diagLog: string[] = [];
function diag(line: string): void {
  diagLog.push(line);
  console.warn(`  ! ${line}`);
}

interface EdaItem {
  id: number;
  name: string;
  description?: string;
  /** «Ингредиенты» из вендорского кабинета Еды (массив строк или {name}) */
  ingredients?: unknown;
  available: boolean;
  price: number;
  weight?: string;
  picture?: { uri?: string; ratio?: number };
  optionsGroups?: {
    id: number;
    name: string;
    required?: boolean;
    minSelected?: number;
    maxSelected?: number;
    options?: { id: number; name: string; price?: number }[];
  }[];
}

interface EdaCategory {
  id: number;
  name: string;
  available: boolean;
  items?: EdaItem[];
}

interface CatalogResponse {
  payload: {
    foundPlace: {
      place: {
        name: string;
        slug: string;
        tags: { name: string }[];
        rating: number;
        picture?: { uri?: string; ratio?: number };
        footerDescription?: string;
      };
    };
  };
}

interface MenuResponse {
  payload: { categories: EdaCategory[] };
}

function slugifyId(prefix: string, id: number): string {
  return `${prefix}-${id}`;
}

/** «Ингредиенты» Еды: массив строк или объектов {name} → строка через запятую */
function normalizeIngredients(raw: unknown): string | undefined {
  if (!Array.isArray(raw)) return undefined;
  const names = raw
    .map((i) => (typeof i === "string" ? i : i && typeof i === "object" && "name" in i ? String((i as { name: unknown }).name) : ""))
    .filter(Boolean);
  return names.length ? names.join(", ") : undefined;
}

function imageUrl(uri: string, size: string): string {
  return `${EDA_HOST}${uri.replace("{w}x{h}", size)}`;
}

/** Размеры под ratio картинки + общий фолбэк (первый рабочий выигрывает) */
function imageCandidates(uri: string, ratio?: number): string[] {
  const sizes: string[] = [];
  if (ratio && ratio > 0) {
    if (ratio >= 1) sizes.push(`800x${Math.round(800 / ratio)}`);
    else sizes.push(`${Math.round(800 * ratio)}x800`);
  }
  sizes.push("800x800", "800x600", "600x800", "800x450");
  return [...new Set(sizes)].map((s) => imageUrl(uri, s));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36" } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/** JSON GET с retry/backoff (шаг 1 лестницы) */
async function fetchJson<T>(url: string): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36",
          Accept: "application/json",
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      diag(`GET ${url} → ${message} (попытка ${attempt + 1}/${RETRY_DELAYS_MS.length + 1})`);
      if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Скачать первый ответивший вариант из списка (фото по лестнице размеров) */
async function downloadFirstOk(urls: string[], what: string): Promise<Buffer | null> {
  for (const url of urls) {
    try {
      return await fetchBuffer(url);
    } catch (error) {
      diag(`${what}: ${url} → ${error instanceof Error ? error.message : error}`);
    }
  }
  return null;
}

/**
 * Шаг 4 лестницы: антибот на API. Playwright грузит карточку и перехватывает
 * ответы тех же эндпоинтов. Капча-сервисы и чужие сессии не используются.
 */
async function fetchViaBrowser(pageUrl: string, placeSlug: string): Promise<{ catalog: CatalogResponse; menu: MenuResponse }> {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36" });
    let catalog: CatalogResponse | null = null;
    let menu: MenuResponse | null = null;
    page.on("response", (response) => {
      const url = response.url();
      if (url.includes("/api/v2/catalog/")) {
        response.json().then((j) => { catalog = j as CatalogResponse; }).catch(() => {});
      }
      if (url.includes("/api/v2/menu/retrieve/")) {
        response.json().then((j) => { menu = j as MenuResponse; }).catch(() => {});
      }
    });
    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    // Дожидаемся оба эндпоинта (страница догружает меню лениво)
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline && (!catalog || !menu)) {
      await page.waitForTimeout(500);
      // Подгружаем ленту, если меню ещё не запрошено
      if (!menu) await page.mouse.wheel(0, 800).catch(() => {});
    }
    if (!catalog) throw new Error("browser: не перехвачен ответ /api/v2/catalog/");
    if (!menu) throw new Error("browser: не перехвачен ответ /api/v2/menu/retrieve/");
    return { catalog, menu };
  } finally {
    await browser.close();
  }
}

async function fileExists(p: string): Promise<boolean> {
  try { await readFile(p); return true; } catch { return false; }
}

async function main() {
  const url = process.argv[2];
  function argvValue(flag: string): string | undefined {
    const idx = process.argv.indexOf(flag);
    return idx >= 0 ? process.argv[idx + 1] : undefined;
  }

  const outIdx = process.argv.indexOf("--out");
  const outDir = path.resolve(outIdx > 0 ? process.argv[outIdx + 1] : "content");
  const fixtureDir = argvValue("--fixture-dir") ? path.resolve(argvValue("--fixture-dir")!) : null;
  const useBrowser = process.argv.includes("--browser");

  if (!url) {
    console.error("Использование: npx tsx scripts/ingest-yandex-eda.ts <url> --out <dir> [--fixture-dir <dir>] [--browser]");
    process.exit(1);
  }

  // slug ресторана из URL
  const placeSlug = new URL(url).searchParams.get("placeSlug") ?? url.split("/r/")[1]?.split("?")[0];
  if (!placeSlug) throw new Error("Не удалось извлечь slug ресторана из URL");
  console.log(`Slug: ${placeSlug}`);

  // 1–2. Инфо о ресторане и меню: fixture / напрямую / через браузер
  let catalog: CatalogResponse;
  let menuData: MenuResponse;
  if (fixtureDir) {
    catalog = JSON.parse(await readFile(path.join(fixtureDir, "catalog.json"), "utf-8")) as CatalogResponse;
    menuData = JSON.parse(await readFile(path.join(fixtureDir, "menu.json"), "utf-8")) as MenuResponse;
    console.log("Режим fixture: API пропущено");
  } else {
    try {
      catalog = await fetchJson<CatalogResponse>(`${EDA_HOST}/api/v2/catalog/${placeSlug}?shippingType=delivery`);
      menuData = await fetchJson<MenuResponse>(`${EDA_HOST}/api/v2/menu/retrieve/${placeSlug}?autoTranslate=false`);
    } catch (error) {
      if (!useBrowser) throw error;
      diag(`прямой API не пробит (${error instanceof Error ? error.message : error}) — включаю --browser`);
      const captured = await fetchViaBrowser(url, placeSlug);
      catalog = captured.catalog;
      menuData = captured.menu;
    }
  }
  const place = catalog.payload.foundPlace.place;
  console.log(`Ресторан: ${place.name}, рейтинг ${place.rating}`);

  // Адрес и часы из footerDescription (свободный текст; юридический адрес
  // продавца — не адрес точки, assemble-content перезапишет из манифеста)
  const footer = place.footerDescription ?? "";
  const addressMatch = footer.match(/Москва[^<,]+|,\s*([А-Яа-яЁё\s.-]+,\s*[^,<]+),\s*ИНН/) ?? null;
  const hoursMatch = footer.match(/Режим работы:\s*с\s*(\d{1,2}:\d{2})\s*до\s*(\d{1,2}:\d{2})/);
  const address = addressMatch ? (addressMatch[1] ?? addressMatch[0]).trim() : "";

  const categories = menuData.payload.categories.filter(
    (c) => c.available && !SKIP_CATEGORIES.has(c.name) && (c.items?.length ?? 0) > 0,
  );

  await mkdir(path.join(outDir, "images", "dishes"), { recursive: true });

  // Картинки из fixture-папки (images/<id>.<ext>, logo.<ext>) — offline-режим
  const fixtureImages = fixtureDir ? new Map((await readdir(path.join(fixtureDir, "images")).catch(() => [] as string[]))
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .map((f) => [path.basename(f).replace(/\.[a-z0-9]+$/i, ""), f] as const)) : null;

  const menuJson = { menus: [] as { id: string; name: string }[], categories: [] as unknown[] };
  const menuIdArg = argvValue("--menu-id");
  const menuNameArg = argvValue("--menu-name");
  if (menuIdArg) {
    if (!menuNameArg) throw new Error("С --menu-id нужен --menu-name");
    menuJson.menus.push({ id: menuIdArg, name: menuNameArg });
  }
  // Слияние: повторный запуск добавляет категории к существующему menu.json
  // (кейс «несколько меню»: каждое заведение Яндекс.Еды — своё меню сайта).
  const existingMenuPath = path.join(outDir, "menu.json");
  try {
    const existing = JSON.parse(await readFile(existingMenuPath, "utf-8")) as {
      menus?: { id: string; name: string }[];
      categories?: unknown[];
    };
    for (const group of existing.menus ?? []) {
      if (!menuJson.menus.some((m) => m.id === group.id)) menuJson.menus.push(group);
    }
    menuJson.categories.push(...(existing.categories ?? []));
  } catch {
    // menu.json ещё нет — первый запуск
  }
  let photoCount = 0;
  let dishCount = 0;

  for (const category of categories) {
    const dishes = [];
    for (const item of category.items ?? []) {
      const id = slugifyId("dish", item.id);
      dishCount++;

      // Фото: fixture-копия, либо скачивание с лестницей размеров под ratio
      let image = "";
      const fixtureImage = fixtureImages?.get(id) ?? fixtureImages?.get(String(item.id));
      if (fixtureImage && fixtureDir) {
        await writeDishImages(
          await readFile(path.join(fixtureDir, "images", fixtureImage)),
          path.join(outDir, "images", "dishes"),
          id,
        );
        image = `images/dishes/${id}.webp`;
        photoCount++;
      } else if (item.picture?.uri && !fixtureDir) {
        const buffer = await downloadFirstOk(imageCandidates(item.picture.uri, item.picture.ratio), `фото ${item.name}`);
        if (buffer) {
          await writeDishImages(buffer, path.join(outDir, "images", "dishes"), id);
          image = `images/dishes/${id}.webp`;
          photoCount++;
        } else {
          diag(`фото не скачалось ни в одном размере: ${item.name}`);
        }
      }

      dishes.push({
        id,
        name: item.name,
        description: item.description ?? "",
        composition: normalizeIngredients(item.ingredients) ?? "",
        price: Math.round(item.price),
        image,
        weight: item.weight ?? "",
        tags: [],
        modifiers: [],
        // Группы Яндекс.Еды сохраняем как группы с min/max (не сплющиваем)
        groups: (item.optionsGroups ?? []).map((g, gi) => ({
          id: slugifyId("group", g.id),
          name: g.name,
          position: gi,
          minSelected: g.minSelected ?? (g.required ? 1 : 0),
          maxSelected: g.maxSelected ?? 99,
          modifiers: (g.options ?? []).map((o) => ({
            id: slugifyId("mod", o.id),
            name: o.name,
            price: Math.round(o.price ?? 0),
          })),
        })),
        available: item.available !== false,
      });
    }
    menuJson.categories.push({
      id: `cat-${category.id}`,
      name: category.name,
      menuId: menuIdArg ?? "",
      dishes,
    });
  }

  // Валидация zod до записи
  const menu = menuSchema.parse(menuJson);

  // Инфо ресторана пишем один раз: при инжесте второго меню не затираем
  // черновик первого заведения — и не валидируем чужой slug.
  const restaurantExists = await fileExists(path.join(outDir, "restaurant.json"));

  const restaurant = restaurantExists
    ? null
    : restaurantSchema.parse({
    name: place.name,
    slug: place.slug.replace(/[_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 64),
    cuisine: place.tags.map((t) => t.name.toLowerCase()).join(", "),
    phone: "DRAFT_PHONE_REPLACE_ME", // Яндекс.Еда не отдаёт телефон — заполнить вручную
    email: "DRAFT_EMAIL_REPLACE_ME@example.invalid", // заполнить при настройке
    address,
    workHours: hoursMatch ? [{ days: "пн–вс", from: hoursMatch[1], to: hoursMatch[2] }] : [],
    socials: { telegram: "", max: "", whatsapp: "", vk: "" },
    seo: {
      title: `${place.name} — заказать с доставкой`,
      description: `${place.name}: ${place.tags.map((t) => t.name).join(", ")}. Заказ онлайн с доставкой.`,
    },
    logo: "images/logo.png",
  });

  if (restaurant) {
    const fixtureLogo = fixtureImages?.get("logo");
    let logoWritten = false;
    if (fixtureLogo && fixtureDir) {
      await writeLogoPng(await readFile(path.join(fixtureDir, "images", fixtureLogo)), path.join(outDir, "images"));
      logoWritten = true;
    } else if (place.picture?.uri && !fixtureDir) {
      // Обложка: лестница размеров под ratio (512x512 404 для 4:3)
      const buffer = await downloadFirstOk(imageCandidates(place.picture.uri, place.picture.ratio ?? 1), "обложка");
      if (buffer) {
        await writeLogoPng(buffer, path.join(outDir, "images"));
        logoWritten = true;
      }
    }
    if (!logoWritten) diag("обложка не скачалась ни в одном размере — положите images/logo.png вручную");
    await writeFile(path.join(outDir, "restaurant.json"), JSON.stringify(restaurant, null, 2));
  } else {
    console.log("  restaurant.json уже есть — не перезаписываю (инжест второго меню)");
  }

  await writeFile(path.join(outDir, "menu.json"), JSON.stringify(menu, null, 2));

  // Дефолтные файлы, если их ещё нет
  const defaults: [string, unknown][] = [
    ["promos.json", { promos: [] }],
    ["pages.json", { pages: [{ slug: "about", title: "О нас", body: "" }] }],
    [
      "settings.json",
      {
        domains: { canonical: "DRAFT_DOMAIN_REPLACE_ME", aliases: [] },
        delivery: { enabled: true, pickupEnabled: true, minOrder: 0, zones: [{ name: "Город", price: 300, freeFrom: null }] },
        channels: {
          telegram: { enabled: false, botTokenRef: "TELEGRAM_BOT_TOKEN", chatId: "" },
          max: { enabled: false, botTokenRef: "MAX_BOT_TOKEN", chatId: "" },
          email: { enabled: false, address: "DRAFT_EMAIL_REPLACE_ME@example.invalid" },
          whatsapp: { enabled: false, phone: "" },
        },
        payment: { provider: "none", shopIdRef: "YOOKASSA_SHOP_ID", secretRef: "YOOKASSA_SECRET" },
        loyalty: { cashbackPercent: 5, maxSpendPercent: 20 },
        booking: { enabled: true, slotMinutes: 30, maxGuestsPerSlot: 20, minHoursAhead: 2 },
        captcha: { provider: "none" },
      },
    ],
    [
      "theme.json",
      {
        preset: "warm",
        accent: "#b45309",
        fontHeading: "Playfair Display",
        fontBody: "Inter",
        radius: "soft",
        dark: false,
        homeBlocks: ["hero", "about", "popular", "promos", "gallery", "contacts"],
      },
    ],
  ];
  for (const [file, value] of defaults) {
    const filePath = path.join(outDir, file);
    try {
      await writeFile(filePath, JSON.stringify(value, null, 2), { flag: "wx" });
    } catch {
      // уже существует — не трогаем
    }
  }

  console.log(`\n✓ Готово: ${menu.categories.length} категорий, ${dishCount} блюд, ${photoCount} фото`);
  console.log(`  Каталог: ${outDir}`);
  console.log(`  ⚠ ЧЕРНОВИК: замените телефон и email (DRAFT_*), а также соцсети перед seed.`);
}

main().catch((error) => {
  console.error("❌ Инжест упал:", error instanceof Error ? error.message : error);
  if (diagLog.length) {
    console.error("\nДиагностика (что перепробовано):");
    for (const line of diagLog) console.error(`  • ${line}`);
    console.error("Если API не пробит и --browser не помог — нужно решение оператора (скрапер/ручной вход). К другому источнику без явной команды не переключаемся.");
  }
  process.exit(1);
});
