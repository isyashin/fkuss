import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { syncMenu } from "@/lib/yandex-eda/sync";

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

  // BUG-006: уважаем intervalMinutes — пропускаем, если с последнего успеха
  // прошло меньше интервала
  const stateRow = await prisma.settings.findUnique({ where: { key: "syncState" } });
  const state = (stateRow?.value ?? {}) as { lastSuccess?: string };
  const interval = settings.sync.intervalMinutes ?? 60;
  if (state.lastSuccess) {
    const ageMs = Date.now() - new Date(state.lastSuccess).getTime();
    if (ageMs < interval * 60_000) {
      return NextResponse.json({ ok: true, skipped: `интервал ${interval} мин не прошёл` });
    }
  }

  const result = await syncMenu(prisma);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
