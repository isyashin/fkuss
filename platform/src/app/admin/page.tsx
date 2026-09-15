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

export default async function PlatformAdminPage() {
  if (!(await isPlatformAdmin())) redirect("/admin/login");

  const prisma = getPrisma();
  const sites = await prisma.site.findMany({
    include: {
      tariff: true,
      ledger: { select: { amount: true } },
      metrics: { orderBy: { date: "desc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl mb-6">Сайты ({sites.length})</h1>
      <div className="space-y-3">
        {sites.map((site) => {
          const balance = site.ledger.reduce((s, t) => s + t.amount, 0);
          const daily = site.tariff ? dailyChargeKopecks(site.tariff.monthlyPrice) : 0;
          const days = daysLeft(balance, daily);
          const last = site.metrics[0];
          return (
            <Link
              key={site.slug}
              href={`/admin/sites/${site.slug}`}
              className="block bg-white rounded-xl border border-zinc-200 p-4 hover:border-zinc-400"
            >
              <div className="flex flex-wrap justify-between gap-2 items-baseline">
                <p className="font-medium text-lg">{site.name}</p>
                <p className={site.state === "active" ? "text-green-600" : "text-red-600"}>
                  {STATE_NAMES[site.state]}
                </p>
              </div>
              <div className="text-sm text-zinc-500 mt-1 flex flex-wrap gap-x-4">
                <span>{site.domains[0] ?? `порт ${site.port}`}</span>
                <span>баланс: {(balance / 100).toFixed(2)} ₽</span>
                <span>хватит на: {days === Infinity ? "∞" : `${days} дн.`}</span>
                {last && (
                  <span>
                    за {last.date}: заказов {last.ordersCount} на {(last.ordersSum / 100).toFixed(0)} ₽, визитов {last.pageViews}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
        {sites.length === 0 && <p className="text-zinc-500">Сайтов пока нет.</p>}
      </div>
    </main>
  );
}
