/**
 * Инжест меню из Яндекс.Еды → content/ шаблона.
 * Использование: npx tsx scripts/ingest-yandex-eda.ts <url> --out <dir>
 * Пример: npx tsx scripts/ingest-yandex-eda.ts "https://eda.yandex.ru/r/chajxana_buxara?placeSlug=chajxana_buxara_xalyal" --out ../sites/buxara/content
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { menuSchema, restaurantSchema } from "../src/lib/content-schema";

const EDA_HOST = "https://eda.yandex.ru";
// Категории-дубли/служебные, которые не переносим
const SKIP_CATEGORIES = new Set(["Что нового", "Выбор пользователей"]);

interface EdaItem {
  id: number;
  name: string;
  description?: string;
  available: boolean;
  price: number;
  weight?: string;
  picture?: { uri?: string };
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

function slugifyId(prefix: string, id: number): string {
  return `${prefix}-${id}`;
}

function imageUrl(uri: string | undefined, size = "800x800"): string | null {
  if (!uri) return null;
  return `${EDA_HOST}${uri.replace("{w}x{h}", size)}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36",
      Accept: "application/json",
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} для ${url}`);
  return response.json() as Promise<T>;
}

async function main() {
  const url = process.argv[2];
  const outIdx = process.argv.indexOf("--out");
  const outDir = path.resolve(outIdx > 0 ? process.argv[outIdx + 1] : "content");

  if (!url) {
    console.error("Использование: npx tsx scripts/ingest-yandex-eda.ts <url> --out <dir>");
    process.exit(1);
  }

  // slug ресторана из URL
  const placeSlug = new URL(url).searchParams.get("placeSlug") ?? url.split("/r/")[1]?.split("?")[0];
  if (!placeSlug) throw new Error("Не удалось извлечь slug ресторана из URL");
  console.log(`Slug: ${placeSlug}`);

  // 1. Инфо о ресторане
  const catalog = await fetchJson<{
    payload: {
      foundPlace: {
        place: {
          name: string;
          slug: string;
          tags: { name: string }[];
          rating: number;
          picture?: { uri?: string };
          footerDescription?: string;
        };
      };
    };
  }>(`${EDA_HOST}/api/v2/catalog/${placeSlug}?shippingType=delivery`);
  const place = catalog.payload.foundPlace.place;
  console.log(`Ресторан: ${place.name}, рейтинг ${place.rating}`);

  // Адрес и часы из footerDescription (свободный текст)
  const footer = place.footerDescription ?? "";
  const addressMatch = footer.match(/Москва[^<,]+|,\s*([А-Яа-яЁё\s.-]+,\s*[^,<]+),\s*ИНН/) ?? null;
  const hoursMatch = footer.match(/Режим работы:\s*с\s*(\d{1,2}:\d{2})\s*до\s*(\d{1,2}:\d{2})/);
  const address = addressMatch ? (addressMatch[1] ?? addressMatch[0]).trim() : "";

  // 2. Меню
  const menuData = await fetchJson<{ payload: { categories: EdaCategory[] } }>(
    `${EDA_HOST}/api/v2/menu/retrieve/${placeSlug}?autoTranslate=false`,
  );

  const categories = menuData.payload.categories.filter(
    (c) => c.available && !SKIP_CATEGORIES.has(c.name) && (c.items?.length ?? 0) > 0,
  );

  await mkdir(path.join(outDir, "images", "dishes"), { recursive: true });

  const menuJson = { categories: [] as unknown[] };
  let photoCount = 0;
  let dishCount = 0;

  for (const category of categories) {
    const dishes = [];
    for (const item of category.items ?? []) {
      const id = slugifyId("dish", item.id);
      dishCount++;

      // Фото: скачиваем и жмём в WebP
      let image = "";
      const url800 = imageUrl(item.picture?.uri);
      if (url800) {
        try {
          const response = await fetch(url800, { headers: { "User-Agent": "Mozilla/5.0" } });
          if (response.ok) {
            const buffer = Buffer.from(await response.arrayBuffer());
            // Два размера: полный (модалка) и карточный (меню) — витрина отдаёт
            // их напрямую, без runtime-оптимизации
            await writeFile(
              path.join(outDir, "images", "dishes", `${id}.webp`),
              await sharp(buffer).resize(800, 800, { fit: "inside" }).webp({ quality: 82 }).toBuffer(),
            );
            await writeFile(
              path.join(outDir, "images", "dishes", `${id}-sm.webp`),
              await sharp(buffer).resize(400, 400, { fit: "inside" }).webp({ quality: 78 }).toBuffer(),
            );
            image = `images/dishes/${id}.webp`;
            photoCount++;
          }
        } catch {
          console.warn(`  ! фото не скачалось: ${item.name}`);
        }
      }

      dishes.push({
        id,
        name: item.name,
        description: item.description ?? "",
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
      dishes,
    });
  }

  // Валидация zod до записи
  const menu = menuSchema.parse(menuJson);

  const restaurant = restaurantSchema.parse({
    name: place.name,
    slug: place.slug.replace(/_/g, "-").slice(0, 64),
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

  // Логотип/обложка ресторана
  const coverUrl = imageUrl(place.picture?.uri, "512x512");
  if (coverUrl) {
    try {
      const response = await fetch(coverUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (response.ok) {
        const buffer = Buffer.from(await response.arrayBuffer());
        await writeFile(path.join(outDir, "images", "logo.png"), await sharp(buffer).png().toBuffer());
      }
    } catch {
      console.warn("  ! обложка не скачалась");
    }
  }

  await writeFile(path.join(outDir, "restaurant.json"), JSON.stringify(restaurant, null, 2));
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
  console.error("❌ Инжест упал:", error);
  process.exit(1);
});
