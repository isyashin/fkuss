import { NextResponse } from "next/server";
import { runMetricsReport } from "@/lib/metrics-report";

/** Отправка метрик на платформу по cron: POST /api/jobs/report-metrics + X-Cron-Secret */
export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const payload = await runMetricsReport();
    return NextResponse.json({ ok: true, payload });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка репорта" },
      { status: 502 },
    );
  }
}
