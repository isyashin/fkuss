import Link from "next/link";
import { redirect } from "next/navigation";
import { getPrisma } from "@/lib/db";
import { isPlatformAdmin } from "@/lib/platform-admin-auth";
import { dailyChargeKopecks, daysLeft } from "@/lib/billing";

export const dynamic = "force-dynamic";

const STATE_NAMES: Record<string, string> = {
  active: "активен",
  grace: "льготный период",
  suspended: "приостановлен",
};

const rub = (kopecks: number) => `${(kopecks / 100).toFixed(2)} ₽`;

export default async function PlatformAdminPage() {
  if (!(await isPlatformAdmin())) redirect("/admin/login");

  const prisma = getPrisma();
  const [sites, balanceAgg] = await Promise.all([
    prisma.site.findMany({
      include: {
        tariff: true,
        ledger: { select: { amount: true } },
        metrics: { orderBy: { date: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.balanceTransaction.aggregate({ _sum: { amount: true } }),
  ]);

  const active = sites.filter((s) => s.state === "active" || s.state === "grace");
  const suspended = sites.length - active.length;
  const mrr = active.reduce((sum, s) => sum + (s.tariff?.monthlyPrice ?? 0), 0);
  const totalBalance = balanceAgg._sum.amount ?? 0;

  return (
    <>
      <div className="pf-intro">
        <span>Платформа сайтов</span>
        <h1>Сайты</h1>
        <p>Все ресторанные сайты: состояние, балансы, тарифы и метрики. Клик по карточке — детали сайта.</p>
      </div>

      <div className="pf-grid pf-grid3" style={{ marginBottom: 18 }}>
        <div className="pf-panel pf-stat">
          <p className="pf-statLabel">MRR · тарифы активных</p>
          <p className="pf-statValue">{rub(mrr)}</p>
          <p className="pf-statNote">в месяц по {active.length} сайтам</p>
        </div>
        <div className="pf-panel pf-stat">
          <p className="pf-statLabel">Суммарный баланс</p>
          <p className="pf-statValue">{rub(totalBalance)}</p>
          <p className="pf-statNote">по всем сайтам</p>
        </div>
        <div className="pf-panel pf-stat">
          <p className="pf-statLabel">Состояние парка</p>
          <p className="pf-statValue">{active.length} / {sites.length}</p>
          <p className="pf-statNote">активных · {suspended > 0 ? `${suspended} приостановлено` : "без приостановок"}</p>
        </div>
      </div>

      <div className="pf-rows">
        {sites.map((site) => {
          const balance = site.ledger.reduce((s, t) => s + t.amount, 0);
          const daily = site.tariff ? dailyChargeKopecks(site.tariff.monthlyPrice) : 0;
          const days = daysLeft(balance, daily);
          const last = site.metrics[0];
          return (
            <Link key={site.slug} href={`/admin/sites/${site.slug}`} className="pf-siteCard">
              <div className="pf-siteCardHead">
                <strong>{site.name}</strong>
                <span className={`pf-badge ${site.state === "active" ? "pf-badgeGreen" : site.state === "grace" ? "pf-badgeBlue" : "pf-badgeRed"}`}>
                  {STATE_NAMES[site.state]}
                </span>
              </div>
              <div className="pf-siteCardMeta">
                <span>{site.domains[0] ?? `порт ${site.port}`}</span>
                <span>баланс {rub(balance)}</span>
                <span>хватит на {days === Infinity ? "∞" : `${days} дн.`}</span>
                {site.tariff && <span>тариф «{site.tariff.name}»</span>}
                {site.imageVersion && <span>образ {site.imageVersion}</span>}
                {last && (
                  <span>за {last.date}: заказов {last.ordersCount} на {(last.ordersSum / 100).toFixed(0)} ₽, визитов {last.pageViews}</span>
                )}
              </div>
            </Link>
          );
        })}
        {sites.length === 0 && <p className="pf-note">Сайтов пока нет.</p>}
      </div>
    </>
  );
}
