/**
 * PWA-иконки ресторана: 192, 512 и apple-touch-icon 180 из логотипа.
 * Нет логотипа — fallback платформы (accent-плашка с буквой названия).
 * Версия иконок (для cache-bust при смене логотипа) — в icons/icons.json.
 * Админка получает отличимый тёмный вариант (admin-*): гостевое и админское
 * приложения на одном телефоне различимы на первый взгляд.
 */
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const GUEST_SIZES = [
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
];

const ADMIN_SIZES = [
  { name: "admin-icon-192.png", size: 192 },
  { name: "admin-icon-512.png", size: 512 },
  { name: "admin-apple-touch-icon.png", size: 180 },
];

// Тёмная плашка админки — как узкая навигационная колонка панели
const ADMIN_BACKGROUND = "#191512";

async function fileExists(p: string): Promise<boolean> {
  try {
    await readFile(p);
    return true;
  } catch {
    return false;
  }
}

/** Иконка: фон-плашка + источник (логотип или буква), вписанный в 90% холста. */
async function renderIcon(source: Buffer, size: number, background: string): Promise<Buffer> {
  const canvas = await sharp({
    create: { width: size, height: size, channels: 4, background },
  })
    .composite([
      {
        input: await sharp(source).resize(Math.round(size * 0.9), Math.round(size * 0.9), { fit: "inside" }).toBuffer(),
        gravity: "center",
      },
    ])
    .png()
    .toBuffer();
  return canvas;
}

/** Fallback платформы: плашка заданного фона с первой буквой названия. */
function letterPlate(name: string, background: string, letterColor: string): Buffer {
  const letter = (name.trim()[0] ?? "R").toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <rect width="512" height="512" rx="96" fill="${background}"/>
      <text x="50%" y="54%" font-family="Arial, sans-serif" font-size="260" font-weight="bold"
        fill="${letterColor}" text-anchor="middle" dominant-baseline="middle">${letter}</text>
    </svg>`;
  return Buffer.from(svg);
}

export interface IconsResult {
  version: string;
  icons: { name: string; path: string }[];
}

export async function generateIcons(
  contentDir: string,
  restaurant: { name: string; logo: string },
  accent: string,
): Promise<IconsResult> {
  const iconsDir = path.join(contentDir, "icons");
  await mkdir(iconsDir, { recursive: true });

  const logoPath = path.join(contentDir, restaurant.logo);
  const hasLogo = restaurant.logo && (await fileExists(logoPath));

  const guestSource = hasLogo ? await readFile(logoPath) : letterPlate(restaurant.name, accent, "#ffffff");
  const adminSource = hasLogo ? guestSource : letterPlate(restaurant.name, ADMIN_BACKGROUND, accent);

  // Render the complete set first. Readers never see a truncated PNG; publish
  // the cache-busting version only after all six atomic file replacements.
  const staging = await mkdtemp(path.join(iconsDir, ".generate-"));
  const version = path.basename(staging).slice(".generate-".length) + Date.now().toString(36);
  const icons: IconsResult["icons"] = [];
  try {
    for (const { name, size } of [...GUEST_SIZES, ...ADMIN_SIZES]) {
      const admin = name.startsWith("admin-");
      await writeFile(path.join(staging, name), await renderIcon(admin ? adminSource : guestSource, size, admin ? ADMIN_BACKGROUND : "#ffffff"));
      icons.push({ name, path: `icons/${name}` });
    }
    await writeFile(path.join(staging, "icons.json"), JSON.stringify({ version, generatedAt: new Date().toISOString() }));
    for (const { name } of icons) await rename(path.join(staging, name), path.join(iconsDir, name));
    await rename(path.join(staging, "icons.json"), path.join(iconsDir, "icons.json"));
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  return { version, icons };
}

/** Asset-only upgrade for existing sites: never seeds or writes business data. */
export async function ensureIcons(contentDir: string, restaurant: { name: string; logo: string }, accent: string): Promise<boolean> {
  let complete = !!(await getIconsVersion(contentDir));
  for (const { name, size } of [...GUEST_SIZES, ...ADMIN_SIZES]) {
    try {
      const metadata = await sharp(path.join(contentDir, "icons", name)).metadata();
      if (metadata.format !== "png" || metadata.width !== size || metadata.height !== size) complete = false;
    } catch { complete = false; }
  }
  if (complete) return false;
  await generateIcons(contentDir, restaurant, accent);
  return true;
}

export async function getIconsVersion(contentDir: string): Promise<string | null> {
  try {
    const raw = await readFile(path.join(contentDir, "icons", "icons.json"), "utf-8");
    return (JSON.parse(raw) as { version?: string }).version ?? null;
  } catch {
    return null;
  }
}
