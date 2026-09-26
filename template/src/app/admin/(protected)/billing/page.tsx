import { fetchMyBilling } from "@/lib/platform";
import { requireAdminPermission } from "@/lib/admin-auth";
import { TopupForm } from "./topup-form";
import { AdminSettingsSubpage } from "../admin-settings-subpage";
import styles from "./billing-admin.module.css";

export const dynamic = "force-dynamic";

const STATE_NAMES: Record<string, string> = {
  active: "активна",
  grace: "льготный период",
  suspended: "приостановлена",
};

export default async function AdminBillingPage() {
  await requireAdminPermission("manage");
  const billing = await fetchMyBilling();

  if (!billing) {
    return (
      <AdminSettingsSubpage title="Подписка" description="Баланс и тариф ресторана.">
        <p className="text-muted">Платформа не подключена к этому сайту (нет SITE_KEY/PLATFORM_URL).</p>
      </AdminSettingsSubpage>
    );
  }

  return (
    <AdminSettingsSubpage title="Подписка и баланс" description="Тариф, счета и активность ресторана.">
    <div className={styles.page}>
      <div className={styles.summary}>
        <div className={styles.stat}><span>Баланс</span><strong>{(billing.balanceKopecks / 100).toLocaleString("ru-RU", { minimumFractionDigits: 2 })} ₽</strong></div>
        <div className={styles.stat}><span>Тариф</span><strong>{billing.tariff ? `${billing.tariff.name} · ${billing.tariff.monthlyPrice} ₽/мес` : "Не назначен"}</strong></div>
        <div className={styles.stat}><span>Подписка</span><strong>{STATE_NAMES[billing.state] ?? billing.state}</strong></div>
        <div className={styles.stat}><span>Хватит на</span><strong>{billing.daysLeft === Infinity ? "∞" : `${billing.daysLeft} дн.`}</strong></div>
      </div>
      <TopupForm />
      <section className={styles.section}>
        <h2>Счета</h2>
        {billing.invoices.length === 0 ? (
          <p className={styles.empty}>Счетов пока нет.</p>
        ) : (
          <div className={styles.list}>
            {billing.invoices.map((inv) => (
              <div key={inv.id} className={styles.item}>
                <span>
                  №{inv.id} от {new Date(inv.createdAt).toLocaleDateString("ru-RU")}
                </span>
                <span>
                  {(inv.amountKopecks / 100).toLocaleString("ru-RU")} ₽ ·{" "}
                  {inv.status === "paid" ? "оплачен" : inv.status === "issued" ? "выставлен" : "отменён"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2>Активность за неделю</h2>
        {billing.metrics.length === 0 ? (
          <p className={styles.empty}>Данные ещё не собраны.</p>
        ) : (
          <div className={styles.list}>
            {billing.metrics.map((m) => (
              <div className={styles.item} key={m.date}>
                {m.date}: заказов {m.ordersCount} на {(m.ordersSumKopecks / 100).toLocaleString("ru-RU")} ₽,
                броней {m.bookingsCount}, посещений {m.pageViews}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
    </AdminSettingsSubpage>
  );
}
