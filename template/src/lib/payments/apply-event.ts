import type { PrismaClient } from "@/generated/prisma/client";
import { statusAfterSuccessfulPayment } from "../order-status";
import { recordAdminEvent } from "../admin-events";
import type { WebhookEvent } from "./types";

/** Возвращает true только для впервые подтверждённой оплаты, когда нужно уведомить ресторан. */
export async function applyPaymentEvent(prisma: PrismaClient, event: WebhookEvent): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: event.orderId } });
      if (!order || order.paymentMethod !== "online" || order.paymentStatus === "paid" || order.paymentStatus === "failed") {
        return "ignored" as const;
      }

      const updated = await tx.order.updateMany({
        where: { id: order.id, paymentStatus: order.paymentStatus, status: order.status },
        data: {
          paymentStatus: event.status,
          paymentId: event.paymentId,
          status: event.status === "paid" ? statusAfterSuccessfulPayment(order.status) : order.status,
        },
      });
      if (updated.count === 1 && event.status === "paid") {
        await recordAdminEvent(tx, "order", order.id, `Заказ №${order.number}`);
      }
      return updated.count === 1 ? "applied" as const : "stale" as const;
    });
    if (result === "applied") return event.status === "paid";
    if (result === "ignored") return false;
  }
  throw new Error("Заказ меняется одновременно с оплатой. Повторите событие.");
}
