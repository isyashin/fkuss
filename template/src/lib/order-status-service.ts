import type { PrismaClient } from "@/generated/prisma/client";
import { accrueOrderBonus, reverseOrderBonus } from "./loyalty";
import { canTransitionOrder, isFinalOrderStatus, type OrderStatus } from "./order-status";

/** Защищённый action проверяет права; здесь атомарно меняются статус и бонусный ledger. */
export async function applyAdminOrderStatus(prisma: PrismaClient, orderId: string, target: OrderStatus): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) throw new Error("Заказ не найден");
    if (!canTransitionOrder(order.type, order.status, target)) {
      throw new Error(`Недопустимый переход: ${order.status} → ${target}`);
    }

    const result = await tx.order.updateMany({
      where: { id: orderId, type: order.type, status: order.status },
      data: { status: target },
    });
    if (result.count !== 1) throw new Error("Заказ изменён другим оператором. Обновите страницу.");

    if (isFinalOrderStatus(order.type, target)) await accrueOrderBonus(tx, orderId);
    if (target === "cancelled") await reverseOrderBonus(tx, orderId);
  });
}
