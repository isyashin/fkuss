/**
 * check-proxy-registered.mjs — страж регрессии счётчика просмотров.
 * Next 16 регистрирует proxy (бывший middleware) в functions-config-manifest.json;
 * унаследованный middleware-manifest.json при этом остаётся пустым — определять
 * поломку нужно по наличию `/_middleware` и собранного бандла middleware.js.
 * Запуск: после `next build` (npm run build → node scripts/check-proxy-registered.mjs).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const serverDir = path.resolve(process.cwd(), ".next/server");
const functionsManifestPath = path.join(serverDir, "functions-config-manifest.json");
const bundlePath = path.join(serverDir, "middleware.js");

const errors = [];

let functionsManifest = null;
try {
  functionsManifest = JSON.parse(readFileSync(functionsManifestPath, "utf-8"));
} catch {
  errors.push(`не найден/не читается ${functionsManifestPath}`);
}

const entry = functionsManifest?.functions?.["/_middleware"];
if (!entry) {
  errors.push("proxy не зарегистрирован: functions['/_middleware'] отсутствует");
} else if (!Array.isArray(entry.matchers) || entry.matchers.length === 0) {
  errors.push("functions['/_middleware'] без matchers — прокси не будет вызван");
}

if (!existsSync(bundlePath)) {
  errors.push(`собранный бандл не найден: ${bundlePath}`);
}

if (errors.length) {
  console.error("❌ Счётчик просмотров сломан (proxy не попадает в сборку):");
  for (const e of errors) console.error(`  • ${e}`);
  console.error("Проверьте src/proxy.ts: в Next 16.3.5 прокси должен быть default-экспортом.");
  process.exit(1);
}

console.log(`✓ Proxy зарегистрирован: ${entry.matchers.length} matcher(ов), бандл middleware.js на месте`);
