/**
 * validate-content.ts — проверка content/ БЕЗ подключения к БД.
 * Использование: npx tsx scripts/validate-content.ts <dir>
 * Код выхода: 0 — ок, 1 — ошибки. Пайплайн запускает это между BUILD и REVIEW.
 */
import path from "node:path";
import { loadAndValidateContent, ContentValidationError } from "./lib/validate";

async function main() {
  const dir = path.resolve(process.argv[2] ?? "content");
  console.log(`Валидирую ${dir}…`);
  try {
    const content = await loadAndValidateContent(dir);
    const dishesCount = content.menu.categories.reduce((n, c) => n + c.dishes.length, 0);
    console.log(
      `✓ ${content.restaurant.name} (${content.restaurant.slug}): категорий ${content.menu.categories.length}, блюд ${dishesCount}, акций ${content.promos.promos.length}, страниц ${content.pages.pages.length}`,
    );
  } catch (error) {
    if (error instanceof ContentValidationError) {
      console.error(`❌ ${error.message}`);
      for (const issue of error.issues) console.error(`  • ${issue}`);
      process.exit(1);
    }
    throw error;
  }
}

main().catch((error) => {
  console.error("❌ Валидация упала:", error instanceof Error ? error.message : error);
  process.exit(1);
});
