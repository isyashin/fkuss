import type { PrismaClient } from "@/generated/prisma/client";
import { PUSH_SUBSCRIPTION_TTL_MS } from "./admin-push";

export type AdminEventKind = "order" | "booking";

export type ClaimedEvent = {
  id: string;
  kind: AdminEventKind;
  label: string;
  createdAt: Date;
  status: string | null; // текущий статус заказа/брони (для остановки звука)
};

const RECEIPT_TTL_MS = 7 * 24 * 3600 * 1000;

/** Записывается в транзакции создания заказа/брони или подтверждения оплаты. */
export async function recordAdminEvent(
  tx: Pick<PrismaClient, "adminEvent" | "adminPushSubscription" | "adminPushDelivery">,
  kind: AdminEventKind,
  reference: string,
  label: string,
): Promise<void> {
  const event = await tx.adminEvent.create({ data: { kind, reference, label } });
  // Outbox web push: каждое активное устройство админа — в той же транзакции,
  // чтобы rollback события не оставлял «висящих» доставок. Давно молчащие
  // устройства не ставим: job всё равно отозвал бы их подписку.
  const subscriptions = await tx.adminPushSubscription.findMany({
    where: { revokedAt: null, user: { active: true }, lastSeenAt: { gt: new Date(Date.now() - PUSH_SUBSCRIPTION_TTL_MS) } },
    select: { id: true },
  });
  if (subscriptions.length) {
    await tx.adminPushDelivery.createMany({
      data: subscriptions.map((subscription) => ({ eventId: event.id, subscriptionId: subscription.id })),
    });
  }
}

/**
 * Выдаёт события вкладке админки: каждая вкладка (userId + tabId) получает
 * своё событие — звук и бейдж срабатывают во всех открытых вкладках учётки.
 * Статусы ссылок прикрепляем, чтобы клиент мог остановить повтор звука,
 * когда заказ/бронь обработаны.
 */
export async function claimAdminEvents(prisma: PrismaClient, userId: string, tabId: string): Promise<ClaimedEvent[]> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.adminUser.findUnique({ where: { id: userId }, select: { createdAt: true, active: true } });
    if (!user?.active) return [];

    const events = await tx.adminEvent.findMany({
      where: { createdAt: { gte: user.createdAt }, receipts: { none: { userId, tabId } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 50,
    });
    if (!events.length) return [];

    const claimed = await tx.adminEventReceipt.createManyAndReturn({
      data: events.map((event) => ({ eventId: event.id, userId, tabId })),
      skipDuplicates: true,
      select: { eventId: true },
    });
    const claimedIds = new Set(claimed.map((receipt) => receipt.eventId));

    // Домаем статусы ссылок одним запросом на kind
    const orderRefs = events.filter((e) => e.kind === "order" && claimedIds.has(e.id)).map((e) => e.reference);
    const bookingRefs = events.filter((e) => e.kind === "booking" && claimedIds.has(e.id)).map((e) => e.reference);
    const [orders, bookings] = await Promise.all([
      orderRefs.length ? tx.order.findMany({ where: { id: { in: orderRefs } }, select: { id: true, status: true } }) : [],
      bookingRefs.length ? tx.reservation.findMany({ where: { id: { in: bookingRefs } }, select: { id: true, status: true } }) : [],
    ]);
    const statusByRef = new Map<string, string>();
    for (const row of orders) statusByRef.set(row.id, row.status);
    for (const row of bookings) statusByRef.set(row.id, row.status);

    // Домаем старые отметки выдачи — таблица не должна расти бесконечно
    await tx.adminEventReceipt.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - RECEIPT_TTL_MS) } } });

    return events
      .filter((event) => claimedIds.has(event.id))
      .map((event) => ({ id: event.id, kind: event.kind as AdminEventKind, label: event.label, createdAt: event.createdAt, status: statusByRef.get(event.reference) ?? null }));
  });
}
