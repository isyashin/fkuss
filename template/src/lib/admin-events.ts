import type { PrismaClient } from "@/generated/prisma/client";

export type AdminEventKind = "order" | "booking";

/** Записывается в транзакции создания заказа/брони или подтверждения оплаты. */
export async function recordAdminEvent(
  tx: Pick<PrismaClient, "adminEvent">,
  kind: AdminEventKind,
  reference: string,
  label: string,
): Promise<void> {
  await tx.adminEvent.create({ data: { kind, reference, label } });
}

/** Конкурирующие вкладки получают только события, которые удалось отметить за этой учётной записью. */
export async function claimAdminEvents(prisma: PrismaClient, userId: string) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.adminUser.findUnique({ where: { id: userId }, select: { createdAt: true, active: true } });
    if (!user?.active) return [];
    const events = await tx.adminEvent.findMany({
      where: { createdAt: { gte: user.createdAt }, receipts: { none: { userId } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 50,
      select: { id: true, kind: true, label: true, createdAt: true },
    });
    if (!events.length) return [];
    const claimed = await tx.adminEventReceipt.createManyAndReturn({
      data: events.map((event) => ({ eventId: event.id, userId })),
      skipDuplicates: true,
      select: { eventId: true },
    });
    const claimedIds = new Set(claimed.map((receipt) => receipt.eventId));
    return events.filter((event) => claimedIds.has(event.id));
  });
}
