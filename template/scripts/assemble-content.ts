/**
 * assemble-content.ts — шаг BUILD пайплайна «ресторан → сайт».
 * Манифест (site-input.json, см. scripts/schemas/site-input.ts) + источник
 * меню → готовый content/, проходящий валидацию без БД.
 *
 * Источник — контракт на весь прогон (yandex-eda | folder), выбранный в опросе;
 * автоматически к другому источнику НЕ переключаемся.
 *
 * Использование:
 *   npx tsx scripts/assemble-content.ts --input <manifest.json> --out <contentDir>
 * Опции окружения:
 *   INGEST_FIXTURE_DIR=<dir> — инжест Еды из записанных ответов (тесты)
 */
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { siteInputSchema, validateSiteInput, platformEmail, type SiteInput } from "./schemas/site-input";
import { loadAndValidateContent, ContentValidationError } from "./lib/validate";
import { dishIdFromFilename, writeDishImages, writeLogoPng } from "./lib/dish-images";

function arg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

async function readManifest(manifestPath: string): Promise<SiteInput> {
  const raw = JSON.parse(await readFile(manifestPath, "utf-8")) as unknown;
  const parsed = siteInputSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("❌ Манифест не прошёл схему:");
    for (const issue of parsed.error.issues) console.error(`  • ${issue.path.join(".")}: ${issue.message}`);
    process.exit(1);
  }
  const errors = validateSiteInput(parsed.data);
  if (errors.length) {
    console.error("❌ Манифест: кросс-полевые правила:");
    for (const e of errors) console.error(`  • ${e}`);
    process.exit(1);
  }
  return parsed.data;
}

/** Источник yandex-eda: инжест (с фолбэками) в outDir. Падает — пайплайн стоп. */
async function buildFromEda(input: SiteInput, outDir: string): Promise<void> {
  if (input.source.kind !== "yandex-eda") throw new Error("buildFromEda: неверный источник");
  const script = path.join(__dirname, "ingest-yandex-eda.ts");
  const fixtureDir = process.env.INGEST_FIXTURE_DIR;
  try {
    execFileSync(process.execPath, ["--import", "tsx", script, input.source.url, "--out", outDir, ...(fixtureDir ? ["--fixture-dir", path.resolve(fixtureDir)] : [])], { stdio: "inherit" });
  } catch {
    // Инжест уже напечатал диагностику — это шаг «полный фейл → отчёт и стоп»
    throw new Error("Инжест Яндекс.Еды не справился (см. диагностику выше). К другому источнику без явной команды не переключаемся.");
  }
}

/** Источник folder: копия + нормализация изображений под конвенцию платформы */
async function buildFromFolder(input: SiteInput, outDir: string): Promise<void> {
  if (input.source.kind !== "folder") throw new Error("buildFromFolder: неверный источник");
  const src = path.resolve(input.source.path);
  for (const file of ["restaurant.json", "menu.json", "settings.json", "theme.json"]) {
    try {
      await readFile(path.join(src, file));
    } catch {
      console.error(`❌ В папке ${src} нет ${file}`);
      console.error("   Нужна структура content/ (шесть JSON + images/). Скелет: npx tsx scripts/new-content.ts <dir> --slug <slug> --name \"<Название>\"");
      process.exit(1);
    }
  }
  await mkdir(outDir, { recursive: true });
  await cp(src, outDir, { recursive: true });

  // Нормализация: <id>.<любой формат> → <id>.webp + <id>-sm.webp; logo.* → logo.png
  const imagesDir = path.join(outDir, "images");
  const entries = await readdir(imagesDir).catch(() => [] as string[]);
  let normalized = 0;
  for (const entry of entries) {
    const full = path.join(imagesDir, entry);
    if (/^logo\.[a-z0-9]+$/i.test(entry) && !await exists(path.join(imagesDir, "logo.png"))) {
      await writeLogoPng(await readFile(full), imagesDir);
      normalized++;
      continue;
    }
    const id = dishIdFromFilename(entry);
    if (!id) continue;
    const hasPair = await exists(path.join(imagesDir, "dishes", `${id}.webp`)) && await exists(path.join(imagesDir, "dishes", `${id}-sm.webp`));
    if (hasPair) continue;
    // Источник: готовый webp или исходник из корня images/
    const source = entry.endsWith(".webp") ? full : full;
    await writeDishImages(await readFile(source), path.join(imagesDir, "dishes"), id);
    normalized++;
  }
  if (normalized) console.log(`  Изображения нормализованы: ${normalized}`);
}

async function exists(p: string): Promise<boolean> {
  try { await readFile(p); return true; } catch { return false; }
}

function hoursText(hours: SiteInput["contacts"]["hours"]): string {
  return hours.map((h) => `${h.days} ${h.from}–${h.to}`).join(", ");
}

/** Патч content/ данными манифеста: контент от источника — это черновик,
 *  манифест — решения владельца. */
async function applyManifest(input: SiteInput, outDir: string): Promise<void> {
  const email = input.contacts.email || platformEmail(input.identity.slug);

  // restaurant.json
  const restaurant = JSON.parse(await readFile(path.join(outDir, "restaurant.json"), "utf-8")) as Record<string, unknown>;
  restaurant.name = input.identity.name;
  restaurant.slug = input.identity.slug;
  if (input.identity.cuisine) restaurant.cuisine = input.identity.cuisine;
  restaurant.phone = input.contacts.phone;
  restaurant.email = email;
  if (input.contacts.address) restaurant.address = input.contacts.address;
  if (input.contacts.hours.length > 0) {
    restaurant.workHours = input.contacts.hours.map((h) => ({ days: h.days, from: h.from, to: h.to }));
  }
  restaurant.socials = input.contacts.socials;
  const hours = hoursText(input.contacts.hours);
  restaurant.seo = {
    title: `${input.identity.name} — ${(input.identity.cuisine || "меню").toLowerCase()}: доставка и самовывоз`,
    description:
      `${input.identity.name}${input.contacts.address ? `, ${input.contacts.address}` : ""}` +
      `${hours ? `. Работаем: ${hours}` : ""}. Заказ онлайн на доставку и самовывоз. Телефон: ${input.contacts.phone}.`,
  };
  await writeFile(path.join(outDir, "restaurant.json"), JSON.stringify(restaurant, null, 2));

  // settings.json: глубокий патч с дефолтами — папка владельца может
  // содержать минимальный/пустой settings.json (дефолты схемы применяет seed,
  // нам нужны опоры для патча)
  const settings = JSON.parse(await readFile(path.join(outDir, "settings.json"), "utf-8")) as Record<string, unknown>;
  const domains = (settings.domains ?? {}) as { canonical?: string; aliases?: string[] };
  domains.canonical = input.identity.domain;
  domains.aliases = domains.aliases ?? [];
  settings.domains = domains;
  const delivery = (settings.delivery ?? {}) as {
    enabled?: boolean;
    pickupEnabled?: boolean;
    minOrder?: number;
    zones?: unknown[];
  };
  delivery.enabled = input.business.deliveryEnabled;
  delivery.pickupEnabled = input.business.pickupEnabled;
  delivery.minOrder = input.business.minOrder;
  delivery.zones = input.business.deliveryEnabled
    ? [{ name: input.business.deliveryZoneName, price: input.business.deliveryPrice, freeFrom: null }]
    : [];
  settings.delivery = delivery;
  const channels = (settings.channels ?? {}) as {
    email?: { enabled?: boolean; address?: string };
    telegram?: unknown;
    max?: unknown;
    whatsapp?: unknown;
  };
  // Схема требует полного каркаса — добиваем дефолтами без записи секретов
  channels.telegram = channels.telegram ?? { enabled: false, botTokenRef: "TELEGRAM_BOT_TOKEN", chatId: "" };
  channels.max = channels.max ?? { enabled: false, botTokenRef: "MAX_BOT_TOKEN", chatId: "" };
  channels.whatsapp = channels.whatsapp ?? { enabled: false, phone: "" };
  channels.email = { enabled: false, address: email };
  settings.channels = channels;
  settings.payment = settings.payment ?? { provider: "none", shopIdRef: "YOOKASSA_SHOP_ID", secretRef: "YOOKASSA_SECRET" };
  settings.captcha = settings.captcha ?? { provider: "none" };
  settings.loyalty = { cashbackPercent: input.business.cashbackPercent, maxSpendPercent: input.business.maxSpendPercent };
  const booking = (settings.booking ?? {}) as { enabled?: boolean };
  booking.enabled = input.business.bookingEnabled;
  settings.booking = booking;
  await writeFile(path.join(outDir, "settings.json"), JSON.stringify(settings, null, 2));

  // theme.json
  const theme = JSON.parse(await readFile(path.join(outDir, "theme.json"), "utf-8")) as Record<string, unknown>;
  theme.preset = input.theme.preset;
  theme.accent = input.theme.accent;
  await writeFile(path.join(outDir, "theme.json"), JSON.stringify(theme, null, 2));

  // pages.json: авторские тексты или шаблоны из подтверждённых полей
  const pagesPath = path.join(outDir, "pages.json");
  const pages = JSON.parse(await readFile(pagesPath, "utf-8")) as { pages: { slug: string; title: string; body: string }[] };
  const upsert = (slug: string, title: string, body: string) => {
    const existing = pages.pages.find((p) => p.slug === slug);
    if (existing) existing.body = body;
    else pages.pages.push({ slug, title, body });
  };
  const aboutText =
    input.content.about ||
    `${input.identity.name}${input.contacts.address ? ` — ресторан по адресу: ${input.contacts.address}` : ""}.` +
      `${input.identity.cuisine ? ` Кухня: ${input.identity.cuisine}.` : ""}` +
      `${hours ? ` Работаем: ${hours}.` : ""} Заказывайте доставку и самовывоз на сайте или по телефону ${input.contacts.phone}.`;
  const deliveryText =
    input.content.deliveryText ||
    (input.business.deliveryEnabled
      ? `Доставляем${input.contacts.address ? ` (${input.contacts.address})` : ""}${hours ? `, ${hours}` : ""}. ` +
        `Стоимость доставки — ${input.business.deliveryPrice} ₽${input.business.minOrder ? `, минимальный заказ — ${input.business.minOrder} ₽` : ""}. ` +
        `Оплата — наличными или картой при получении. Заказы и вопросы: ${input.contacts.phone}.`
      : `Самовывоз${input.contacts.address ? `: ${input.contacts.address}` : ""}${hours ? `. Работаем: ${hours}` : ""}. Заказы и вопросы: ${input.contacts.phone}.`);
  upsert("about", "О нас", aboutText);
  upsert("delivery", "Доставка и оплата", deliveryText);
  await writeFile(pagesPath, JSON.stringify(pages, null, 2));
}

/** source-report.json: что откуда взято, что не подтверждено — честный след для владельца */
async function writeSourceReport(input: SiteInput, outDir: string): Promise<string[]> {
  const unresolved: string[] = [...input.decisions.gaps];
  const confirmed: string[] = ["name", "slug", "domain (вводные владельца)"];
  if (input.contacts.phoneConfirmedBy !== "unconfirmed") {
    confirmed.push(`phone (${input.contacts.phoneConfirmedBy})`);
  } else {
    unresolved.push("phone — не подтверждён, требуется решение владельца");
  }
  if (!input.contacts.email) unresolved.push(`email — служебный ящик платформы ${platformEmail(input.identity.slug)}, реальный запросить у владельца`);
  if (input.contacts.address) confirmed.push("address (вводные/источники)");
  if (input.contacts.hours.length > 0) confirmed.push(`hours (${input.contacts.hours.map((h) => h.source).join(", ")})`);
  if (input.source.kind === "yandex-eda") confirmed.push("menu, prices, modifiers (карточка Яндекс.Еды)");
  else confirmed.push("menu, images (папка владельца)");
  if (input.decisions.notes) unresolved.push(`заметки: ${input.decisions.notes}`);

  const report = {
    checkedAt: new Date().toISOString(),
    sources:
      input.source.kind === "yandex-eda"
        ? [{ url: input.source.url, kind: "yandex-eda", fields: ["name", "menu", "prices", "modifiers", "workHours", "images"] }]
        : [{ url: path.resolve(input.source.path), kind: "owner-folder", fields: ["menu", "images"] }],
    confirmed,
    unresolved,
    imageRights:
      input.source.kind === "yandex-eda"
        ? "images: фото из карточки ресторана на Яндекс.Еде (загружены владельцем заведения)"
        : "images: предоставлены владельцем (папка)",
    pipeline: "assemble-content.ts по манифесту site-input.json",
  };
  await writeFile(path.join(outDir, "source-report.json"), JSON.stringify(report, null, 2));
  return unresolved;
}

async function main() {
  const manifestPath = arg("--input");
  const outDir = path.resolve(arg("--out") ?? "");
  if (!manifestPath || !outDir) {
    console.error("Использование: npx tsx scripts/assemble-content.ts --input <manifest.json> --out <contentDir>");
    process.exit(1);
  }
  const input = await readManifest(path.resolve(manifestPath));
  console.log(`Манифест ok: ${input.identity.name} (${input.identity.slug}), источник: ${input.source.kind}`);

  await mkdir(outDir, { recursive: true });
  if (input.source.kind === "yandex-eda") await buildFromEda(input, outDir);
  else await buildFromFolder(input, outDir);

  await applyManifest(input, outDir);
  const unresolved = await writeSourceReport(input, outDir);

  // Манифест кладём рядом — provision-site.sh читает approvedBy отсюда
  await writeFile(path.join(outDir, "site-input.json"), JSON.stringify(input, null, 2));

  // VALIDATE: без БД. Красный — агент чинит, деплоя не будет
  try {
    const content = await loadAndValidateContent(outDir);
    const dishesCount = content.menu.categories.reduce((n, c) => n + c.dishes.length, 0);
    console.log(`\n✓ Content готов: ${content.menu.categories.length} категорий, ${dishesCount} блюд, ${content.promos.promos.length} акций`);
  } catch (error) {
    if (error instanceof ContentValidationError) {
      console.error(`\n❌ ${error.message}`);
      for (const issue of error.issues) console.error(`  • ${issue}`);
      console.error("Пайплайн остановлен: исправьте контент или манифест и повторите.");
      process.exit(1);
    }
    throw error;
  }

  console.log(`  Пробелы (${unresolved.length}): ${unresolved.join("; ") || "нет"}`);
  if (!input.approvedBy) console.log("  ⚠ approvedBy пуст — после REVIEW добавьте подтверждение, без него provision-site.sh не стартует.");
  console.log(`\nДальше: tar -czf content.tar.gz -C ${path.dirname(outDir)} ${path.basename(outDir)} && scp … && provision-site.sh`);
}

main().catch((error) => {
  console.error("❌ assemble-content упал:", error instanceof Error ? error.message : error);
  process.exit(1);
});
