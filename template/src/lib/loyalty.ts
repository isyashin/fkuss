/**
 * Лояльность: ledger BonusTransaction — единственный источник баланса.
 * accrual (начисление), spend (списание), reversal (сторно начисления),
 * refund (возврат потраченного при отмене).
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { isFinalOrderStatus } from "./order-status";

type Tx = PrismaClient | Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends" | "$use">;

export async function getBonusBalance(prisma: Tx, customerId: string): Promise<number> {
  const agg = await prisma.bonusTransaction.aggregate({
    where: { customerId },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

/** Начислить кэшбэк после выдачи/доставки заказа. Идемпотентно. */
export async function accrueOrderBonus(prisma: Tx, orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || !order.customerId || order.bonusAccrued <= 0 || !isFinalOrderStatus(order.type, order.status)) return;

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

  const bonusSpendNet = await prisma.bonusTransaction.aggregate({
    where: { orderId: order.id, type: { in: ["spend", "refund"] } },
    _sum: { amount: true },
  });
  const remainingSpent = -(bonusSpendNet._sum.amount ?? 0);
  if (remainingSpent > 0) {
    await prisma.bonusTransaction.create({
      data: {
        customerId: order.customerId,
        orderId: order.id,
        type: "refund",
        amount: remainingSpent,
        comment: `Возврат бонусов, отмена заказа №${order.number}`,
      },
    });
  }
}
