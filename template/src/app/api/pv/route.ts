import { NextResponse } from "next/server";
import { incrementPageView } from "@/lib/metrics-counter";

/** Приём просмотра из proxy (узкий, уже отфильтрован) */
export async function POST() {
  await incrementPageView().catch(() => {});
  return NextResponse.json({ ok: true });
}
