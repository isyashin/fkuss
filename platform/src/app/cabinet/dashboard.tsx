import { getPrisma } from "@/lib/db";
import { dailyChargeKopecks, daysLeft } from "@/lib/billing";
import { TopupForm } from "./topup-form";
import { ExportButton } from "./export-button";

export async function OwnerDashboard({ ownerId }: { ownerId: string }) {
  const prisma = getPrisma();
  const owner = await prisma.ownerAccount.findUnique({
    where: { id: ownerId },
    include: { site: { include: { tariff: true } } },
  });
  if (!owner) return <p className="text-zinc-500">Аккаунт не найден.</p>;

  const site = owner.site as typeof owner.site & { exportReadyPath?: string | null };
  const [balanceAgg, metrics, invoices] = await Promise.all([
    prisma.balanceTransaction.aggregate({ where: { siteId: site.slug }, _sum: { amount: true } }),
    prisma.metricSnapshot.findMany({
      where: { siteId: site.slug },
      orderBy: { date: "desc" },
      take: 7,
    }),
    prisma.invoice.findMany({
      where: { siteId: site.slug },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  const balance = balanceAgg._sum.amount ?? 0;
  const daily = site.tariff ? dailyChargeKopecks(site.tariff.monthlyPrice) : 0;
  const days = daysLeft(balance, daily);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-zinc-200 p-5">
        <p className="text-sm text-zinc-500">{site.name} · {site.domains[0] ?? site.slug}</p>
        <p className="text-3xl font-semibold mt-1">{(balance / 100).toFixed(2)} ₽</p>
        <p className="text-sm text-zinc-500 mt-1">
          {site.tariff ? `тариф «${site.tariff.name}», ${site.tariff.monthlyPrice} ₽/мес` : "без тарифа"}
          {" · "}хватит на {days === Infinity ? "∞" : `${days} дн.`}
        </p>
        <div className="mt-4">
          <TopupForm slug={site.slug} />
        </div>
      </div>

      <section className="bg-white rounded-xl border border-zinc-200 p-5">
        <h2 className="font-medium mb-2">Метрики за неделю</h2>
        <div className="text-sm text-zinc-600 space-y-1">
          {metrics.length === 0 && <p>Данные ещё не приходили.</p>}
          {metrics.map((m) => (
            <p key={m.id}>
              {m.date}: заказов {m.ordersCount} на {(m.ordersSum / 100).toFixed(0)} ₽, броней {m.bookingsCount}, визитов {m.pageViews}
            </p>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-xl border border-zinc-200 p-5">
        <h2 className="font-medium mb-2">Счета</h2>
        <div className="text-sm text-zinc-600 space-y-1">
          {invoices.length === 0 && <p>Счетов нет.</p>}
          {invoices.map((inv) => (
            <p key={inv.id}>
              №{inv.id} от {inv.createdAt.toLocaleDateString("ru-RU")} — {(inv.amount / 100).toFixed(2)} ₽ (
              {inv.status === "paid" ? "оплачен" : inv.status === "issued" ? "выставлен" : "отменён"})
            </p>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-xl border border-zinc-200 p-5">
        <h2 className="font-medium mb-2">Экспорт сайта</h2>
        <p className="text-sm text-zinc-500 mb-3">
          Архив контента и базы данных сайта появится здесь после подготовки.
        </p>
        {site.exportReadyPath ? (
          <div className="flex flex-wrap gap-3">
            <a
              href="/api/export/download"
              className="inline-flex min-h-11 px-5 items-center rounded-full bg-zinc-900 text-white text-sm font-medium"
            >
              Скачать архив ({site.exportReadyPath})
            </a>
            <ExportButton slug={site.slug} requested={false} label="Подготовить новый архив" />
          </div>
        ) : (
          <ExportButton slug={site.slug} requested={Boolean(site.exportRequestedAt)} />
        )}
      </section>
    </div>
  );
}
