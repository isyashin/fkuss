/** Ядро ежедневного биллинга: списание, переходы состояний, уведомления. */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { dailyChargeKopecks, daysLeft, nextState, shouldNotify } from "./billing";
import {
  claimLowBalanceNotification,
  isUniqueConstraintError,
  lowBalanceNotificationKey,
} from "./billing-ledger";

const GRACE_DAYS = 3;

export async function runBillingDaily(): Promise<string[]> {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const log: string[] = [];

  const sites = await prisma.site.findMany({ include: { tariff: true } });

  for (const site of sites) {
    if (!site.tariff) continue;
    const daily = dailyChargeKopecks(site.tariff.monthlyPrice);

    // Идемпотентность через уникальный dedupeKey: повторный запуск за день
    // упирается в unique-индекс и пропускается (гонки cron не страшны)
    if (site.state !== "suspended" && daily > 0) {
      const today = new Date().toISOString().slice(0, 10);
      try {
        await prisma.balanceTransaction.create({
          data: {
            siteId: site.slug,
            type: "charge",
            amount: -daily,
            dedupeKey: `charge:${site.slug}:${today}`,
            comment: `Тариф «${site.tariff.name}» за день`,
          },
        });
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        // уже списано сегодня — пропускаем
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
    // Уникальный ключ включает последнее пополнение: новый topup начинает
    // новый цикл порогов, а параллельные cron не дублируют уведомление.
    const lastTopup = await prisma.balanceTransaction.findFirst({
      where: { siteId: site.slug, type: "topup" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    const threshold = shouldNotify(days, []);
    if (threshold !== null) {
      const cycleId = lastTopup?.id ?? "initial";
      const claimed = await claimLowBalanceNotification(prisma, site.slug, cycleId, threshold);
      if (claimed) {
        try {
          const { notifyLowBalance } = await import("./platform-notify");
          await notifyLowBalance(site.slug, days, balance);
          log.push(`${site.slug}: уведомление «осталось ${days} дн.»`);
        } catch {
          // Доставка не удалась — снимаем claim, чтобы следующий cron повторил.
          await prisma.balanceTransaction.deleteMany({
            where: { dedupeKey: lowBalanceNotificationKey(site.slug, cycleId, threshold) },
          });
        }
      }
    }
  }

  await prisma.$disconnect();
  return log;
}
