import { NextResponse } from "next/server";
import { runBillingDaily } from "@/lib/billing-job";

/** Ежедневный запуск биллинга из cron: POST /api/jobs/billing-daily с X-Cron-Secret */
export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const log = await runBillingDaily();
  return NextResponse.json({ ok: true, log });
}
