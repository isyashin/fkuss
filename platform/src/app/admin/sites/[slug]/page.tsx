import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getPrisma } from "@/lib/db";
import { isPlatformAdmin } from "@/lib/platform-admin-auth";
import { dailyChargeKopecks, daysLeft } from "@/lib/billing";
import { SiteActions } from "./site-actions";
import { ExportSiteButton } from "./export-site-button";

export const dynamic = "force-dynamic";

const rub = (kopecks: number) => `${(kopecks / 100).toFixed(2)} ₽`;

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
      payments: { orderBy: { createdAt: "desc" }, take: 20 },
      owners: true,
    },
  });
  if (!site) notFound();

  const tariffs = await prisma.tariff.findMany();
  const agg = await prisma.balanceTransaction.aggregate({
    where: { siteId: slug },
    _sum: { amount: true },
  });
  const fullBalance = agg._sum.amount ?? 0;
  const daily = site.tariff ? dailyChargeKopecks(site.tariff.monthlyPrice) : 0;
  const days = daysLeft(fullBalance, daily);

  return (
    <>
      <div className="pf-intro">
        <span><Link href="/admin" style={{ color: "inherit" }}>← все сайты</Link></span>
        <h1>{site.name}</h1>
        <p>{site.domains.join(", ") || `порт ${site.port}`} · состояние: {site.state}{site.imageVersion ? ` · образ ${site.imageVersion}` : ""}</p>
      </div>

      <div className="pf-grid pf-grid3" style={{ marginBottom: 16 }}>
        <div className="pf-panel pf-stat">
          <p className="pf-statLabel">Баланс</p>
          <p className="pf-statValue">{rub(fullBalance)}</p>
          <p className="pf-statNote">хватит на {days === Infinity ? "∞" : `${days} дн.`} ({site.state})</p>
        </div>
        <div className="pf-panel pf-stat">
          <p className="pf-statLabel">Тариф</p>
          <p className="pf-statValue">{site.tariff?.name ?? "—"}</p>
          <p className="pf-statNote">{site.tariff ? `${site.tariff.monthlyPrice} ₽ в месяц` : "не назначен"}</p>
        </div>
        <div className="pf-panel pf-stat">
          <p className="pf-statLabel">Метрики</p>
          <p className="pf-statValue" style={{ fontSize: 18 }}>
            {site.lastMetricsAt ? "приходят" : "нет данных"}
          </p>
          <p className="pf-statNote">
            {site.lastMetricsAt
              ? `последний раз ${site.lastMetricsAt.toISOString().slice(0, 10)}`
              : "снапшоты ещё не приходили"}
          </p>
        </div>
      </div>

      <div className="pf-panel" style={{ marginBottom: 16 }}>
        <h2 className="pf-panelTitle">Операции</h2>
        <p className="pf-panelHint">Тариф, состояние сайта и ручные корректировки баланса.</p>
        <SiteActions slug={slug} tariffs={tariffs} currentTariff={site.tariffId} state={site.state} />
      </div>

      <div className="pf-panel" style={{ marginBottom: 16 }}>
        <h2 className="pf-panelTitle">Экспорт сайта</h2>
        <p className="pf-panelHint">Архив content/ и дамп базы сайта для передачи клиенту.</p>
        <ExportSiteButton slug={slug} requested={Boolean(site.exportRequestedAt) && !site.exportReadyPath} readyPath={site.exportReadyPath} />
      </div>

      <div className="pf-panel" style={{ marginBottom: 16 }}>
        <h2 className="pf-panelTitle">Метрики (14 дней)</h2>
        <p className="pf-panelHint">Обновляются при заказе/брони и каждые 6 часов по расписанию.</p>
        <div className="pf-tableWrap">
          <table className="pf-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Заказы</th>
                <th>Сумма</th>
                <th>Брони</th>
                <th>Визиты</th>
              </tr>
            </thead>
            <tbody>
              {site.metrics.map((m) => (
                <tr key={m.id}>
                  <td>{m.date}</td>
                  <td>{m.ordersCount}</td>
                  <td>{(m.ordersSum / 100).toFixed(0)} ₽</td>
                  <td>{m.bookingsCount}</td>
                  <td>{m.pageViews}</td>
                </tr>
              ))}
              {site.metrics.length === 0 && (
                <tr><td colSpan={5} className="pf-muted">Нет данных</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="pf-grid pf-grid2">
        <div className="pf-panel">
          <h2 className="pf-panelTitle">Операции с балансом</h2>
          <p className="pf-panelHint">Лента ledger: списания, пополнения, корректировки.</p>
          <div className="pf-rows">
            {site.ledger.map((t) => (
              <div key={t.id} className="pf-row">
                <div className="pf-rowMain">
                  <span>{t.comment || t.type}</span>
                  <small>{t.createdAt.toISOString().slice(0, 10)} · {t.type}</small>
                </div>
                <span className={t.amount >= 0 ? "pf-amountPos" : "pf-amountNeg"}>
                  {t.amount >= 0 ? "+" : ""}{rub(t.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="pf-panel">
          <h2 className="pf-panelTitle">Счета и платежи</h2>
          <p className="pf-panelHint">Выставленные счета и проведённые платежи сайта.</p>
          <div className="pf-rows" style={{ marginBottom: 14 }}>
            {site.invoices.map((inv) => (
              <div key={inv.id} className="pf-row">
                <div className="pf-rowMain">
                  <span>Счёт №{inv.id}{inv.comment ? ` · ${inv.comment}` : ""}</span>
                  <small>{inv.createdAt.toISOString().slice(0, 10)}</small>
                </div>
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className={`pf-badge ${inv.status === "paid" ? "pf-badgeGreen" : inv.status === "cancelled" ? "pf-badgeNeutral" : "pf-badgeBlue"}`}>
                    {inv.status === "paid" ? "оплачен" : inv.status === "issued" ? "выставлен" : "отменён"}
                  </span>
                  <span>{rub(inv.amount)}</span>
                </span>
              </div>
            ))}
            {site.invoices.length === 0 && <p className="pf-note">Счетов нет.</p>}
          </div>
          <div className="pf-rows">
            {site.payments.map((p) => (
              <div key={p.id} className="pf-row">
                <div className="pf-rowMain">
                  <span>Платёж {p.providerPaymentId ?? p.id.slice(0, 12)}</span>
                  <small>{p.createdAt.toISOString().slice(0, 10)}</small>
                </div>
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className={`pf-badge ${p.status === "paid" ? "pf-badgeGreen" : p.status === "failed" ? "pf-badgeRed" : "pf-badgeNeutral"}`}>
                    {p.status === "paid" ? "оплачен" : p.status === "failed" ? "ошибка" : "в обработке"}
                  </span>
                  <span>{rub(p.amount)}</span>
                </span>
              </div>
            ))}
            {site.payments.length === 0 && <p className="pf-note">Платежей нет.</p>}
          </div>
        </div>
      </div>

      <div className="pf-panel" style={{ marginTop: 16 }}>
        <h2 className="pf-panelTitle">Владельцы сайта</h2>
        <p className="pf-panelHint">Аккаунты с доступом в кабинет ({site.owners.length}).</p>
        <p style={{ margin: 0, fontSize: 13 }}>{site.owners.map((o) => o.email).join(", ") || "не назначены"}</p>
      </div>
    </>
  );
}
