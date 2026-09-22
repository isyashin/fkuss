/** Генератор плейсхолдеров для отсутствующих изображений тест-контента (BUG-018) */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getContentDir, resolveContentPath } from "../src/lib/content-dir";

const CONTENT = getContentDir();

function contentPath(relativePath: string): string {
  const resolved = resolveContentPath(relativePath);
  if (!resolved) throw new Error(`Недопустимый путь внутри CONTENT_DIR: ${relativePath}`);
  return resolved;
}

const PALETTE = ["#b45309", "#92400e", "#78350f", "#a16207", "#854d0e"];

function letter(name: string): string {
  return (name.trim()[0] ?? "Б").toUpperCase();
}

async function exists(p: string): Promise<boolean> {
  try {
    await readFile(p);
    return true;
  } catch {
    return false;
  }
}

async function makePlaceholder(relPath: string, text: string, colorIndex: number) {
  const abs = contentPath(relPath);
  if (await exists(abs)) return false;
  const color = PALETTE[colorIndex % PALETTE.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800">
    <rect width="800" height="800" fill="${color}"/>
    <circle cx="400" cy="360" r="160" fill="rgba(255,255,255,0.15)"/>
    <text x="50%" y="40%" font-family="Georgia, serif" font-size="120" fill="#fff" text-anchor="middle" dominant-baseline="middle">${text}</text>
    <text x="50%" y="90%" font-family="Arial" font-size="34" fill="rgba(255,255,255,0.8)" text-anchor="middle">фото скоро</text>
  </svg>`;
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, await sharp(Buffer.from(svg)).webp({ quality: 80 }).toBuffer());
  return true;
}

async function main() {
  const menu = JSON.parse(await readFile(path.join(CONTENT, "menu.json"), "utf-8"));
  const restaurant = JSON.parse(await readFile(path.join(CONTENT, "restaurant.json"), "utf-8"));
  const promos = JSON.parse(await readFile(path.join(CONTENT, "promos.json"), "utf-8"));

let made = 0;
let i = 0;
for (const category of menu.categories) {
  for (const dish of category.dishes) {
    if (dish.image && !(await exists(contentPath(dish.image)))) {
      if (await makePlaceholder(dish.image, letter(dish.name), i++)) made++;
      // и карточный размер
      const sm = dish.image.replace(/\.webp$/, "-sm.webp");
      if (!(await exists(contentPath(sm)))) {
        await writeFile(
          contentPath(sm),
          await sharp(await readFile(contentPath(dish.image))).resize(400, 400, { fit: "inside" }).webp({ quality: 78 }).toBuffer(),
        );
      }
    }
  }
}

if (!(await exists(contentPath(restaurant.logo)))) {
  if (await makePlaceholder(restaurant.logo, letter(restaurant.name), 0)) made++;
}
for (const promo of promos.promos) {
  if (promo.image && !(await exists(contentPath(promo.image)))) {
    if (await makePlaceholder(promo.image, letter(promo.title), 2)) made++;
  }
}

console.log(`Плейсхолдеров создано: ${made}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
