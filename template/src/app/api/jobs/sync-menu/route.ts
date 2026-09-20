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
  const settings = settingsRow?.value as { sync?: { enabled?: boolean } } | undefined;

  if (settings?.sync?.enabled === false) {
    return NextResponse.json({ ok: true, skipped: "sync disabled" });
  }

  const result = await syncMenu(prisma);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
