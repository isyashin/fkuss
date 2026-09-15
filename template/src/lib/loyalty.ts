/**
 * Лояльность: ledger BonusTransaction — единственный источник баланса.
 * accrual (начисление), spend (списание), reversal (сторно начисления),
 * refund (возврат потраченного при отмене).
 */
import type { PrismaClient } from "@/generated/prisma/client";

type Tx = PrismaClient | Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends" | "$use">;

export async function getBonusBalance(prisma: Tx, customerId: string): Promise<number> {
  const agg = await prisma.bonusTransaction.aggregate({
    where: { customerId },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

/** Начислить кэшбэк за заказ (при статусе «выполнен»). Идемпотентно. */
export async function accrueOrderBonus(prisma: Tx, orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || !order.customerId || order.bonusAccrued <= 0) return;

  const existing = await prisma.bonusTransaction.findFirst({
    where: { orderId: order.id, type: "accrual" },
  });
  if (existing) return;

  await prisma.bonusTransaction.create({
    data: {
      customerId: order.customerId,
      orderId: order.id,
      type: "accrual",
      amount: order.bonusAccrued,
      comment: `Кэшбэк за заказ №${order.number}`,
    },
  });
}

/** Сторно при отмене заказа: откат начисления + возврат потраченного. Идемпотентно. */
export async function reverseOrderBonus(prisma: Tx, orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || !order.customerId) return;

  const accrual = await prisma.bonusTransaction.findFirst({
    where: { orderId: order.id, type: "accrual" },
  });
  if (accrual) {
    const reversed = await prisma.bonusTransaction.findFirst({
      where: { orderId: order.id, type: "reversal" },
    });
    if (!reversed) {
      await prisma.bonusTransaction.create({
        data: {
          customerId: order.customerId,
          orderId: order.id,
          type: "reversal",
          amount: -accrual.amount,
          comment: `Сторно кэшбэка, отмена заказа №${order.number}`,
        },
      });
    }
  }

  const spend = await prisma.bonusTransaction.findFirst({
    where: { orderId: order.id, type: "spend" },
  });
  if (spend) {
    const refunded = await prisma.bonusTransaction.findFirst({
      where: { orderId: order.id, type: "refund" },
    });
    if (!refunded) {
      await prisma.bonusTransaction.create({
        data: {
          customerId: order.customerId,
          orderId: order.id,
          type: "refund",
          amount: -spend.amount,
          comment: `Возврат бонусов, отмена заказа №${order.number}`,
        },
      });
    }
  }
}
