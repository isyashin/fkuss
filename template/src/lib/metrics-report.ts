/** Ядро репортёра метрик: агрегаты из БД → платформа. */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getPageViews } from "./metrics-counter";

export async function runMetricsReport(): Promise<Record<string, unknown>> {
  const platformUrl = process.env.PLATFORM_URL;
  const siteKey = process.env.SITE_KEY;
  if (!platformUrl || !siteKey) {
    throw new Error("Нужны PLATFORM_URL и SITE_KEY");
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const date = new Date().toISOString().slice(0, 10);
  const dayStart = new Date(`${date}T00:00:00Z`);
  const dayEnd = new Date(`${date}T23:59:59Z`);

  const [ordersAgg, bookingsCount, pageViews] = await Promise.all([
    prisma.order.aggregate({
      where: { createdAt: { gte: dayStart, lte: dayEnd }, status: { not: "cancelled" } },
      _count: true,
      _sum: { total: true },
    }),
    prisma.reservation.count({
      where: { createdAt: { gte: dayStart, lte: dayEnd }, status: { not: "cancelled" } },
    }),
    getPageViews(date),
  ]);

  const payload = {
    date,
    ordersCount: ordersAgg._count,
    ordersSum: Math.round((ordersAgg._sum.total ?? 0) * 100),
    bookingsCount,
    pageViews,
  };

  const response = await fetch(`${platformUrl}/api/metrics`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Site-Key": siteKey },
    body: JSON.stringify(payload),
  });
  await prisma.$disconnect();

  if (!response.ok) {
    throw new Error(`Платформа ответила ${response.status}`);
  }
  return payload;
}
