/** billing-daily.ts — CLI-обёртка ядра биллинга (локальный запуск/cron). */
import { runBillingDaily } from "../src/lib/billing-job";

runBillingDaily()
  .then((log) => {
    for (const line of log) console.log(" ", line);
    console.log("✓ Биллинг завершён");
    process.exit(0);
  })
  .catch((e) => {
    console.error("❌ Биллинг упал:", e);
    process.exit(1);
  });
