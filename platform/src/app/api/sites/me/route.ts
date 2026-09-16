import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { dailyChargeKopecks, daysLeft } from "@/lib/billing";

/** Данные биллинга самого сайта. GET /api/sites/me, заголовок X-Site-Key. */
export async function GET(request: Request) {
  const siteKey = request.headers.get("x-site-key");
  if (!siteKey) return NextResponse.json({ error: "Нет ключа" }, { status: 401 });

  const prisma = getPrisma();
  const site = await prisma.site.findUnique({
    where: { siteKey },
    include: {
      tariff: true,
      invoices: { orderBy: { createdAt: "desc" }, take: 10 },
      metrics: { orderBy: { date: "desc" }, take: 7 },
    },
  });
  if (!site) return NextResponse.json({ error: "Неизвестный сайт" }, { status: 403 });

  const agg = await prisma.balanceTransaction.aggregate({
    where: { siteId: site.slug },
    _sum: { amount: true },
  });
  const balance = agg._sum.amount ?? 0;
  const daily = site.tariff ? dailyChargeKopecks(site.tariff.monthlyPrice) : 0;

  return NextResponse.json({
    name: site.name,
    slug: site.slug,
    state: site.state,
    balanceKopecks: balance,
    daysLeft: daysLeft(balance, daily),
    tariff: site.tariff ? { name: site.tariff.name, monthlyPrice: site.tariff.monthlyPrice } : null,
    invoices: site.invoices.map((i) => ({
      id: i.id,
      amountKopecks: i.amount,
      status: i.status,
      createdAt: i.createdAt,
    })),
    metrics: site.metrics.map((m) => ({
      date: m.date,
      ordersCount: m.ordersCount,
      ordersSumKopecks: m.ordersSum,
      bookingsCount: m.bookingsCount,
      pageViews: m.pageViews,
    })),
  });
}
