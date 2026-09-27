import { getPrisma } from "@/lib/db";
import { dailyChargeKopecks, daysLeft } from "@/lib/billing";
import { TopupForm } from "./topup-form";
import { ExportButton } from "./export-button";
import { NotifyChannelSettings } from "./notify-channel-settings";

export async function OwnerDashboard({ ownerId }: { ownerId: string }) {
  const prisma = getPrisma();
  const owner = await prisma.ownerAccount.findUnique({
    where: { id: ownerId },
    include: { site: { include: { tariff: true } } },
  });
  if (!owner) return <p className="pf-note">Аккаунт не найден.</p>;

  const site = owner.site as typeof owner.site & { exportReadyPath?: string | null };
  const [balanceAgg, metrics, invoices, payments] = await Promise.all([
    prisma.balanceTransaction.aggregate({ where: { siteId: site.slug }, _sum: { amount: true } }),
    prisma.metricSnapshot.findMany({ where: { siteId: site.slug }, orderBy: { date: "desc" }, take: 7 }),
    prisma.invoice.findMany({ where: { siteId: site.slug }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.payment.findMany({ where: { siteId: site.slug }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);

  const balance = balanceAgg._sum.amount ?? 0;
  const daily = site.tariff ? dailyChargeKopecks(site.tariff.monthlyPrice) : 0;
  const days = daysLeft(balance, daily);
  const rub = (kopecks: number) => `${(kopecks / 100).toFixed(2)} ₽`;

  return (
    <>
      <div className="pf-intro">
        <span>Кабинет владельца</span>
        <h1>Мой сайт</h1>
        <p>{site.name} · {site.domains[0] ?? site.slug}{site.imageVersion ? ` · образ ${site.imageVersion}` : ""}</p>
      </div>

      <div className="pf-grid pf-grid2" style={{ marginBottom: 16 }}>
        <div className="pf-panel pf-stat">
          <p className="pf-statLabel">Баланс</p>
          <p className="pf-statValue">{rub(balance)}</p>
          <p className="pf-statNote">
            {site.tariff ? `тариф «${site.tariff.name}», ${rub(site.tariff.monthlyPrice)}/мес` : "без тарифа"}
            {" · "}хватит на {days === Infinity ? "∞" : `${days} дн.`}
          </p>
          <div style={{ marginTop: 14 }}>
            <TopupForm slug={site.slug} />
          </div>
        </div>
        <div className="pf-panel">
          <h2 className="pf-panelTitle">Уведомления о балансе</h2>
          <p className="pf-panelHint">Куда присылать предупреждения за 7 / 3 / 1 день до исчерпания баланса.</p>
          <NotifyChannelSettings initialChannel={owner.notifyChannel} initialChatId={owner.notifyTelegramChatId} />
        </div>
      </div>

      <div className="pf-grid pf-grid2">
        <div className="pf-panel">
          <h2 className="pf-panelTitle">Метрики за неделю</h2>
          <p className="pf-panelHint">Заказы, брони и визиты по дням.</p>
          <div className="pf-rows">
            {metrics.length === 0 && <p className="pf-note">Данные ещё не приходили.</p>}
            {metrics.map((m) => (
              <div key={m.id} className="pf-row">
                <div className="pf-rowMain">
                  <span>{m.date}</span>
                  <small>броней {m.bookingsCount} · визитов {m.pageViews}</small>
                </div>
                <span>заказов {m.ordersCount} · {(m.ordersSum / 100).toFixed(0)} ₽</span>
              </div>
            ))}
          </div>
        </div>

        <div className="pf-panel">
          <h2 className="pf-panelTitle">Счета и платежи</h2>
          <p className="pf-panelHint">История выставленных счетов и оплат.</p>
          <div className="pf-rows" style={{ marginBottom: 12 }}>
            {invoices.length === 0 && <p className="pf-note">Счетов нет.</p>}
            {invoices.map((inv) => (
              <div key={inv.id} className="pf-row">
                <div className="pf-rowMain">
                  <span>Счёт №{inv.id}</span>
                  <small>{inv.createdAt.toISOString().slice(0, 10)}</small>
                </div>
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className={`pf-badge ${inv.status === "paid" ? "pf-badgeGreen" : inv.status === "cancelled" ? "pf-badgeNeutral" : "pf-badgeBlue"}`}>
                    {inv.status === "paid" ? "оплачен" : inv.status === "issued" ? "выставлен" : "отменён"}
                  </span>
                  {rub(inv.amount)}
                </span>
              </div>
            ))}
          </div>
          <div className="pf-rows">
            {payments.map((p) => (
              <div key={p.id} className="pf-row">
                <div className="pf-rowMain">
                  <span>Платёж {p.providerPaymentId ?? p.id.slice(0, 12)}</span>
                  <small>{p.createdAt.toISOString().slice(0, 10)}</small>
                </div>
                <span className={`pf-badge ${p.status === "paid" ? "pf-badgeGreen" : p.status === "failed" ? "pf-badgeRed" : "pf-badgeNeutral"}`}>
                  {p.status === "paid" ? "оплачен" : p.status === "failed" ? "ошибка" : "в обработке"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="pf-panel" style={{ marginTop: 16 }}>
        <h2 className="pf-panelTitle">Экспорт сайта</h2>
        <p className="pf-panelHint">Архив контента и базы данных сайта появится здесь после подготовки.</p>
        {site.exportReadyPath ? (
          <div className="pf-actionsRow">
            <a href="/api/export/download" className="pf-btn pf-btnPrimary">Скачать архив</a>
            <span className="pf-badge pf-badgeGreen">{site.exportReadyPath}</span>
            <ExportButton slug={site.slug} requested={false} label="Подготовить новый архив" />
          </div>
        ) : (
          <ExportButton slug={site.slug} requested={Boolean(site.exportRequestedAt)} />
        )}
      </div>
    </>
  );
}
