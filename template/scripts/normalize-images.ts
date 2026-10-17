/**
 * normalize-images.ts — папка с фотографиями → конвенция изображений платформы.
 * Имена файлов связаны с id блюд: «dish-123.jpg» → images/dishes/dish-123.webp
 * + dish-123-sm.webp. «logo.*» → images/logo.png. Использование:
 *   npx tsx scripts/normalize-images.ts <inputDir> <contentDir>
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { dishIdFromFilename, writeDishImages, writeLogoPng } from "./lib/dish-images";

async function main() {
  const inputDir = path.resolve(process.argv[2] ?? "");
  const contentDir = path.resolve(process.argv[3] ?? "");
  if (!inputDir || !contentDir || process.argv.length < 4) {
    console.error("Использование: npx tsx scripts/normalize-images.ts <inputDir> <contentDir>");
    process.exit(1);
  }

  const files = await readdir(inputDir);
  const images = files.filter((f) => /\.(jpe?g|png|webp|gif|avif)$/i.test(f));
  if (images.length === 0) {
    console.error(`❌ В ${inputDir} нет изображений (jpg/png/webp)`);
    process.exit(1);
  }

  let dishes = 0;
  let logo = false;
  for (const file of images) {
    const buffer = await readFile(path.join(inputDir, file));
    if (/^logo\.[a-z0-9]+$/i.test(file)) {
      await writeLogoPng(buffer, path.join(contentDir, "images"));
      logo = true;
      continue;
    }
    const id = dishIdFromFilename(file);
    if (!id) {
      console.warn(`  ! пропускаю ${file} — имя должно быть <dish-id>.<ext> (или logo.<ext>)`);
      continue;
    }
    await writeDishImages(buffer, path.join(contentDir, "images", "dishes"), id);
    dishes++;
  }

  console.log(`✓ Нормализовано: ${dishes} блюд${logo ? " + логотип" : ""} → ${path.join(contentDir, "images")}`);
  if (!logo) console.warn("  ! logo.* не найден — логотип нужен для readiness");
}

main().catch((error) => {
  console.error("❌ Нормализация упала:", error instanceof Error ? error.message : error);
  process.exit(1);
});
