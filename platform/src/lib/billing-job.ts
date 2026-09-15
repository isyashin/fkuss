/** Ядро ежедневного биллинга: списание, переходы состояний, уведомления. */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { dailyChargeKopecks, daysLeft, nextState, shouldNotify } from "./billing";

const GRACE_DAYS = 3;

export async function runBillingDaily(): Promise<string[]> {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const log: string[] = [];

  const sites = await prisma.site.findMany({ include: { tariff: true } });

  for (const site of sites) {
    if (!site.tariff) continue;
    const daily = dailyChargeKopecks(site.tariff.monthlyPrice);

    // Идемпотентность: не списываем дважды за одни сутки (ретрай cron)
    if (site.state !== "suspended" && daily > 0) {
      const todayStart = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
      const alreadyCharged = await prisma.balanceTransaction.findFirst({
        where: { siteId: site.slug, type: "charge", createdAt: { gte: todayStart } },
      });
      if (!alreadyCharged) {
        await prisma.balanceTransaction.create({
          data: {
            siteId: site.slug,
            type: "charge",
            amount: -daily,
            comment: `Тариф «${site.tariff.name}» за день`,
          },
        });
      }
    }

    const agg = await prisma.balanceTransaction.aggregate({
      where: { siteId: site.slug },
      _sum: { amount: true },
    });
    const balance = agg._sum.amount ?? 0;

    const daysInState = Math.floor(
      (Date.now() - site.stateChangedAt.getTime()) / (24 * 3600 * 1000),
    );
    const state = nextState({
      state: site.state as "active" | "grace" | "suspended",
      balanceKopecks: balance,
      graceDays: GRACE_DAYS,
      daysInState,
    });
    if (state !== site.state) {
      await prisma.site.update({
        where: { slug: site.slug },
        data: { state, stateChangedAt: new Date() },
      });
      log.push(`${site.slug}: ${site.state} → ${state}`);
    }

    const days = daysLeft(balance, daily);
    const sentRaw = await prisma.balanceTransaction.findFirst({
      where: { siteId: site.slug, type: "adjustment", comment: { startsWith: "notify:" } },
      orderBy: { createdAt: "desc" },
    });
    const alreadySent = sentRaw ? sentRaw.comment.replace("notify:", "").split(",").map(Number) : [];
    const threshold = shouldNotify(days, alreadySent);
    if (threshold !== null) {
      await prisma.balanceTransaction.create({
        data: {
          siteId: site.slug,
          type: "adjustment",
          amount: 0,
          comment: `notify:${[...alreadySent, threshold].join(",")}`,
        },
      });
      const { notifyLowBalance } = await import("./platform-notify");
      await notifyLowBalance(site.slug, days, balance).catch(() => {});
      log.push(`${site.slug}: уведомление «осталось ${days} дн.»`);
    }
  }

  await prisma.$disconnect();
  return log;
}
