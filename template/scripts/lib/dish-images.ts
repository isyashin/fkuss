/**
 * Общая нормализация изображений блюд: любой исходник (jpg/png/webp)
 * → images/dishes/<id>.webp (до 800px) + <id>-sm.webp (до 400px).
 * Используется normalize-images.ts (папочный вход) и assemble-content.ts.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/** Конвенция платформы: полный вариант до 800px, карточный до 400px */
export async function writeDishImages(sourceBuffer: Buffer, dishesDir: string, id: string): Promise<void> {
  await mkdir(dishesDir, { recursive: true });
  const image = sharp(sourceBuffer);
  await writeFile(
    path.join(dishesDir, `${id}.webp`),
    await image.clone().resize(800, 800, { fit: "inside" }).webp({ quality: 82 }).toBuffer(),
  );
  await writeFile(
    path.join(dishesDir, `${id}-sm.webp`),
    await image.clone().resize(400, 400, { fit: "inside" }).webp({ quality: 78 }).toBuffer(),
  );
}

export async function writeLogoPng(sourceBuffer: Buffer, imagesDir: string): Promise<void> {
  await mkdir(imagesDir, { recursive: true });
  await writeFile(path.join(imagesDir, "logo.png"), await sharp(sourceBuffer).png().toBuffer());
}

/** Имя файла «<id>.<ext>» → id (без -sm: он служебный) */
export function dishIdFromFilename(filename: string): string | null {
  const base = path.basename(filename);
  if (base.startsWith("logo.")) return null;
  const match = base.match(/^([a-z0-9-]+?)(?:-sm)?\.[a-z0-9]+$/i);
  if (!match) return null;
  const id = match[1];
  return id.endsWith("-sm") ? null : id;
}
