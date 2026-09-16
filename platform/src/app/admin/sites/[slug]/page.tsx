import { redirect, notFound } from "next/navigation";
import { getPrisma } from "@/lib/db";
import { isPlatformAdmin } from "@/lib/platform-admin-auth";
import { dailyChargeKopecks, daysLeft } from "@/lib/billing";
import { SiteActions } from "./site-actions";

export const dynamic = "force-dynamic";

export default async function SiteCardPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!(await isPlatformAdmin())) redirect("/admin/login");
  const { slug } = await params;

  const prisma = getPrisma();
  const site = await prisma.site.findUnique({
    where: { slug },
    include: {
      tariff: true,
      ledger: { orderBy: { createdAt: "desc" }, take: 50 },
      metrics: { orderBy: { date: "desc" }, take: 14 },
      invoices: { orderBy: { createdAt: "desc" }, take: 20 },
      owners: true,
    },
  });
  if (!site) notFound();

  const tariffs = await prisma.tariff.findMany();
  const balance = site.ledger.reduce((s, t) => s + t.amount, 0);
  // ledger отсортирован desc — баланс считаем по всем записям отдельно
  const agg = await prisma.balanceTransaction.aggregate({
    where: { siteId: slug },
    _sum: { amount: true },
  });
  const fullBalance = agg._sum.amount ?? 0;
  const daily = site.tariff ? dailyChargeKopecks(site.tariff.monthlyPrice) : 0;
  const days = daysLeft(fullBalance, daily);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 space-y-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl">{site.name}</h1>
        <a href="/admin" className="text-sm text-zinc-500">← все сайты</a>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-zinc-200 p-4">
          <p className="text-sm text-zinc-500">Баланс</p>
          <p className="text-2xl font-semibold">{(fullBalance / 100).toFixed(2)} ₽</p>
          <p className="text-sm text-zinc-500">
            хватит на {days === Infinity ? "∞" : `${days} дн.`} · состояние: {site.state}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-zinc-200 p-4">
          <p className="text-sm text-zinc-500">Тариф</p>
          <p className="text-2xl font-semibold">{site.tariff?.name ?? "—"}</p>
          <p className="text-sm text-zinc-500">
            {site.tariff ? `${site.tariff.monthlyPrice} ₽/мес` : "не назначен"}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-zinc-200 p-4">
          <p className="text-sm text-zinc-500">Домены</p>
          <p className="text-sm">{site.domains.join(", ") || `порт ${site.port}`}</p>
          <p className="text-sm text-zinc-500">
            метрики: {site.lastMetricsAt ? site.lastMetricsAt.toLocaleString("ru-RU") : "не приходили"}
          </p>
        </div>
      </div>

      <SiteActions slug={slug} tariffs={tariffs} currentTariff={site.tariffId} state={site.state} />

      <section>
        <h2 className="text-xl mb-3">Метрики (14 дней)</h2>
        <p className="text-sm text-zinc-500 mb-2">
          данные на: {site.lastMetricsAt ? site.lastMetricsAt.toLocaleString("ru-RU") : "метрики ещё не приходили"}
          {" · "}обновляются при заказе/брони + каждые 6 ч по расписанию
        </p>
        <table className="w-full text-sm bg-white rounded-xl border border-zinc-200">
          <thead>
            <tr className="text-left text-zinc-500 border-b">
              <th className="p-3">Дата</th>
              <th className="p-3">Заказы</th>
              <th className="p-3">Сумма</th>
              <th className="p-3">Брони</th>
              <th className="p-3">Визиты</th>
            </tr>
          </thead>
          <tbody>
            {site.metrics.map((m) => (
              <tr key={m.id} className="border-b last:border-0">
                <td className="p-3">{m.date}</td>
                <td className="p-3">{m.ordersCount}</td>
                <td className="p-3">{(m.ordersSum / 100).toFixed(0)} ₽</td>
                <td className="p-3">{m.bookingsCount}</td>
                <td className="p-3">{m.pageViews}</td>
              </tr>
            ))}
            {site.metrics.length === 0 && (
              <tr><td className="p-3 text-zinc-500" colSpan={5}>Нет данных</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-xl mb-3">Операции с балансом</h2>
        <div className="space-y-2">
          {site.ledger.map((t) => (
            <div key={t.id} className="bg-white rounded-lg border border-zinc-200 p-3 flex justify-between text-sm">
              <span>{t.comment || t.type}</span>
              <span className={t.amount >= 0 ? "text-green-600" : "text-red-600"}>
                {t.amount >= 0 ? "+" : ""}{(t.amount / 100).toFixed(2)} ₽
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl mb-3">Владельцы</h2>
        <p className="text-sm text-zinc-600">
          {site.owners.map((o) => o.email).join(", ") || "не назначены"}
        </p>
      </section>
      <div className="hidden">{balance}</div>
    </main>
  );
}
