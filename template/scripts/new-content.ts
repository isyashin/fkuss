/**
 * new-content.ts — генератор скелета content/ для папочного ввода.
 * Пишет шесть JSON с дефолтами схем и пометками-заглушками, которые
 * assemble-content.ts заменит данными манифеста (readiness не пропустит
 * DRAFT_* — это направляющие, а не готовый контент). Использование:
 *   npx tsx scripts/new-content.ts <dir> --slug <slug> --name "<Название>"
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function arg(flag: string): string {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : "";
}

async function main() {
  const dir = path.resolve(process.argv[2] ?? "");
  const slug = arg("--slug");
  const name = arg("--name");
  if (!dir || !slug || !name) {
    console.error('Использование: npx tsx scripts/new-content.ts <dir> --slug <slug> --name "<Название>"');
    process.exit(1);
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    console.error("slug: строчные латинские буквы, цифры, дефисы");
    process.exit(1);
  }

  await mkdir(path.join(dir, "images", "dishes"), { recursive: true });

  const files: [string, unknown][] = [
    [
      "restaurant.json",
      {
        name,
        slug,
        cuisine: "",
        phone: "DRAFT_PHONE_REPLACE_ME",
        email: "DRAFT_EMAIL_REPLACE_ME@example.invalid",
        address: "",
        workHours: [],
        socials: { telegram: "", max: "", whatsapp: "", vk: "" },
        seo: { title: "", description: "" },
        logo: "images/logo.png",
      },
    ],
    ["menu.json", { menus: [], categories: [] }],
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

  for (const [file, value] of files) {
    await writeFile(path.join(dir, file), JSON.stringify(value, null, 2), { flag: "wx" });
  }
  console.log(`✓ Скелет content/ создан: ${dir}`);
  console.log("  Дальше: наполните menu.json и images/, либо передайте папку в assemble-content.ts с манифестом.");
}

main().catch((error) => {
  console.error("❌ Создание скелета упало:", error instanceof Error ? error.message : error);
  process.exit(1);
});
