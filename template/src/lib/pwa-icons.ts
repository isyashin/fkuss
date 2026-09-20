/**
 * PWA-иконки ресторана: 192, 512 и apple-touch-icon 180 из логотипа.
 * Нет логотипа — fallback платформы (accent-плашка с буквой названия).
 * Версия иконок (для cache-bust при смене логотипа) — в icons/icons.json.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const SIZES = [
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
];

async function fileExists(p: string): Promise<boolean> {
  try {
    await readFile(p);
    return true;
  } catch {
    return false;
  }
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
  let source: Buffer;

  if (restaurant.logo && (await fileExists(logoPath))) {
    source = await readFile(logoPath);
  } else {
    // Fallback платформы: accent-плашка с первой буквой названия (SVG → sharp)
    const letter = (restaurant.name.trim()[0] ?? "R").toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <rect width="512" height="512" rx="96" fill="${accent}"/>
      <text x="50%" y="54%" font-family="Arial, sans-serif" font-size="260" font-weight="bold"
        fill="#ffffff" text-anchor="middle" dominant-baseline="middle">${letter}</text>
    </svg>`;
    source = Buffer.from(svg);
  }

  const version = Date.now().toString(36);
  const icons: IconsResult["icons"] = [];
  for (const { name, size } of SIZES) {
    // Безопасные поля: логотип вписан в 90% холста
    const canvas = await sharp({
      create: { width: size, height: size, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
    })
      .composite([
        {
          input: await sharp(source).resize(Math.round(size * 0.9), Math.round(size * 0.9), { fit: "inside" }).toBuffer(),
          gravity: "center",
        },
      ])
      .png()
      .toBuffer();
    await writeFile(path.join(iconsDir, name), canvas);
    icons.push({ name, path: `icons/${name}` });
  }

  await writeFile(path.join(iconsDir, "icons.json"), JSON.stringify({ version, generatedAt: new Date().toISOString() }));
  return { version, icons };
}

export async function getIconsVersion(contentDir: string): Promise<string | null> {
  try {
    const raw = await readFile(path.join(contentDir, "icons", "icons.json"), "utf-8");
    return (JSON.parse(raw) as { version?: string }).version ?? null;
  } catch {
    return null;
  }
}
