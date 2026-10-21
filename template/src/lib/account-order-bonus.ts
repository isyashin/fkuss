import type { PrismaClient } from "@/generated/prisma/client";
import { isFinalOrderStatus } from "./order-status";

/** Только начисление и его сторно: возврат списанных бонусов не является кэшбэком. */
export async function getRecordedOrderBonuses(prisma: PrismaClient, customerId: string, orderIds: string[]): Promise<Map<string, number>> {
  if (!orderIds.length) return new Map();
  const entries = await prisma.bonusTransaction.groupBy({
    by: ["orderId"],
    where: { customerId, orderId: { in: orderIds }, type: { in: ["accrual", "reversal"] } },
    _sum: { amount: true },
  });
  return new Map(entries.flatMap(entry => entry.orderId ? [[entry.orderId, entry._sum.amount ?? 0] as const] : []));
}

export function describeOrderBonus(order: { type: string; status: string; bonusAccrued: number }, recorded: number | undefined): { label: string; amount: number } | null {
  if (recorded !== undefined) {
    if (recorded > 0) return { label: "Начислено бонусов", amount: recorded };
    if (recorded < 0) return { label: "Корректировка бонусов", amount: recorded };
    return { label: "Начисление отменено", amount: 0 };
  }
  if (order.status === "cancelled" || order.bonusAccrued <= 0) return null;
  if (isFinalOrderStatus(order.type, order.status)) return { label: "Бонусы не начислены", amount: 0 };
  return { label: "Бонусы после выполнения", amount: order.bonusAccrued };
}

export function formatOrderBonus(amount: number): string {
  return `${amount > 0 ? "+" : ""}${amount.toLocaleString("ru-RU")}`;
}
