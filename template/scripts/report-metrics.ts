/** report-metrics.ts — CLI-обёртка (локальный запуск). */
import { runMetricsReport } from "../src/lib/metrics-report";

runMetricsReport()
  .then((payload) => {
    console.log("✓ Метрики отправлены:", payload);
    process.exit(0);
  })
  .catch((e) => {
    console.error("❌ Репорт упал:", e);
    process.exit(1);
  });
