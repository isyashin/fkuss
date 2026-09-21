import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { syncMenu } from "@/lib/yandex-eda/sync";

const DEFAULT_SYNC_INTERVAL_MINUTES = 60;

/** Решение о запуске всегда принимается сервером, а не cron или клиентом. */
export function isSyncDue(
  lastSuccess: string | undefined,
  intervalMinutes: number | undefined,
  now = Date.now(),
): boolean {
  if (!lastSuccess) return true;

  const lastSuccessMs = Date.parse(lastSuccess);
  if (!Number.isFinite(lastSuccessMs)) return true;

  const interval =
    Number.isInteger(intervalMinutes) && intervalMinutes! >= 5 && intervalMinutes! <= 1440
      ? intervalMinutes!
      : DEFAULT_SYNC_INTERVAL_MINUTES;
  return now - lastSuccessMs >= interval * 60_000;
}

/** Синхронизация меню с Яндекс.Едой по cron: POST /api/jobs/sync-menu + X-Cron-Secret */
export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const prisma = getPrisma();
  const settingsRow = await prisma.settings.findUnique({ where: { key: "settings" } });
  const settings = settingsRow?.value as
    | { sync?: { enabled?: boolean; intervalMinutes?: number; placeSlug?: string } }
    | undefined;

  if (settings?.sync?.enabled !== true) {
    return NextResponse.json({ ok: true, skipped: "sync disabled" });
  }
  if (!settings.sync.placeSlug) {
    return NextResponse.json({ ok: false, error: "placeSlug не задан" }, { status: 400 });
  }

  // intervalMinutes — серверный gate: частый cron не меняет частоту синхронизации.
  const stateRow = await prisma.settings.findUnique({ where: { key: "syncState" } });
  const state = (stateRow?.value ?? {}) as { lastSuccess?: string };
  const interval = settings.sync.intervalMinutes ?? DEFAULT_SYNC_INTERVAL_MINUTES;
  if (!isSyncDue(state.lastSuccess, interval)) {
    return NextResponse.json({ ok: true, skipped: `интервал ${interval} мин не прошёл` });
  }

  // syncMenu удерживает атомарную блокировку syncState, поэтому cron и ручной
  // запуск не смогут синхронизировать один tenant параллельно.
  const result = await syncMenu(prisma);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
