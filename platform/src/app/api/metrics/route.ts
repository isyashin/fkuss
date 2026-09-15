import { NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/db";

const metricSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ordersCount: z.number().int().min(0).default(0),
  ordersSum: z.number().int().min(0).default(0), // копейки
  bookingsCount: z.number().int().min(0).default(0),
  pageViews: z.number().int().min(0).default(0),
});

/** Приём агрегатов от сайтов. Заголовок X-Site-Key. Персональных данных гостей нет. */
export async function POST(request: Request) {
  const siteKey = request.headers.get("x-site-key");
  if (!siteKey) return NextResponse.json({ error: "Нет ключа" }, { status: 401 });

  const prisma = getPrisma();
  const site = await prisma.site.findUnique({ where: { siteKey } });
  if (!site) return NextResponse.json({ error: "Неизвестный сайт" }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const parsed = metricSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Проверьте поля метрик" }, { status: 400 });
  }

  const m = parsed.data;
  await prisma.metricSnapshot.upsert({
    where: { siteId_date: { siteId: site.slug, date: m.date } },
    create: { siteId: site.slug, ...m },
    update: m,
  });
  await prisma.site.update({
    where: { slug: site.slug },
    data: { lastMetricsAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
