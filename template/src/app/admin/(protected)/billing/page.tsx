import { fetchMyBilling } from "@/lib/platform";
import { requireAdminPermission } from "@/lib/admin-auth";
import { TopupForm } from "./topup-form";
import { AdminSettingsSubpage } from "../admin-settings-subpage";

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
    <div className="max-w-2xl space-y-6">

      <div className="bg-card rounded-[var(--radius)] p-5">
        <div className="flex flex-wrap justify-between items-baseline gap-2">
          <p className="text-3xl font-semibold text-accent">
            {(billing.balanceKopecks / 100).toLocaleString("ru-RU", { minimumFractionDigits: 2 })} ₽
          </p>
          <p className="text-sm text-muted">подписка {STATE_NAMES[billing.state] ?? billing.state}</p>
        </div>
        <p className="text-muted text-sm mt-1">
          {billing.tariff
            ? `Тариф «${billing.tariff.name}» — ${billing.tariff.monthlyPrice} ₽/мес · баланса хватит на ${billing.daysLeft === Infinity ? "∞" : `${billing.daysLeft} дн.`}`
            : "Тариф не назначен"}
        </p>
        <div className="mt-4">
          <TopupForm />
        </div>
      </div>

      <section>
        <h2 className="text-xl mb-3">Счета</h2>
        {billing.invoices.length === 0 ? (
          <p className="text-muted text-sm">Счетов пока нет.</p>
        ) : (
          <div className="space-y-2">
            {billing.invoices.map((inv) => (
              <div key={inv.id} className="bg-card rounded-[var(--radius)] p-3 flex justify-between text-sm">
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

      <section>
        <h2 className="text-xl mb-3">Активность за неделю</h2>
        {billing.metrics.length === 0 ? (
          <p className="text-muted text-sm">Данные ещё не собраны.</p>
        ) : (
          <div className="space-y-1 text-sm text-muted">
            {billing.metrics.map((m) => (
              <p key={m.date}>
                {m.date}: заказов {m.ordersCount} на {(m.ordersSumKopecks / 100).toLocaleString("ru-RU")} ₽,
                броней {m.bookingsCount}, посещений {m.pageViews}
              </p>
            ))}
          </div>
        )}
      </section>
    </div>
    </AdminSettingsSubpage>
  );
}
