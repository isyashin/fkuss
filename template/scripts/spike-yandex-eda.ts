/**
 * Спайк: извлечь меню из страницы Яндекс.Еды.
 * Вопрос: можно ли получить категории/блюда/цены/фото без логина?
 * Запуск: npx tsx scripts/spike-yandex-eda.ts <url>
 */
import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";

const url = process.argv[2] ?? "https://eda.yandex.ru/r/chajxana_buxara?placeSlug=chajxana_buxara_xalyal";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    locale: "ru-RU",
  });

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(5000);

  const title = await page.title();
  console.log("TITLE:", title);

  // Кандидаты встроенных данных
  const found = await page.evaluate(() => {
    const w = window as unknown as Record<string, unknown>;
    const keys = Object.keys(w).filter((k) => /state|data|store|initial|redux/i.test(k));
    const jsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map(
      (s) => s.textContent?.slice(0, 200) ?? "",
    );
    const nextData = document.getElementById("__NEXT_DATA__")?.textContent?.slice(0, 200) ?? null;
    return { windowKeys: keys, jsonLdCount: jsonLd.length, jsonLd, nextData };
  });
  console.log("WINDOW KEYS:", found.windowKeys);
  console.log("JSON-LD count:", found.jsonLdCount);
  if (found.jsonLd.length) console.log("JSON-LD sample:", found.jsonLd[0]);
  console.log("NEXT_DATA:", found.nextData);

  // Текст страницы для анализа структуры меню
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 3000));
  await writeFile("spike-eda-body.txt", bodyText);
  await page.screenshot({ path: "spike-eda.png", fullPage: false });
  console.log("BODY (first 1200 chars):\n", bodyText.slice(0, 1200));

  await browser.close();
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
