import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { createWebPushTransport, isPushConfigured, processPushDeliveries } from "@/lib/admin-push";

/**
 * Минутный job доставки push: забирает due-доставки из outbox, шлёт, ретраит.
 * Ставится install-site-jobs.sh рядом с report-metrics/sync-menu (X-Cron-Secret).
 * Быстрый after()-запуск из роутов заказа/брони/webhook дожимает этим job'ом,
 * если сам не справился — заказ от сбоев push не зависит.
 */
export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isPushConfigured()) {
    return NextResponse.json({ ok: true, enabled: false });
  }

  const result = await processPushDeliveries(getPrisma(), { transport: createWebPushTransport() });
  // В логах — только счётчики, без endpoint и гостевых данных
  console.info("[push-delivery]", JSON.stringify(result));
  return NextResponse.json({ ok: true, enabled: true, ...result });
}
