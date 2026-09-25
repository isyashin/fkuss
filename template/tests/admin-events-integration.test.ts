import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { createAdminUser } from "@/lib/admin-users";
import { claimAdminEvents, recordAdminEvent } from "@/lib/admin-events";
import { applyPaymentEvent } from "@/lib/payments/apply-event";

// Только одноразовая PostgreSQL после миграции 0006.
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const prefix = `events-${crypto.randomUUID()}`;
const orderIds: string[] = [];
const bookingIds: string[] = [];
const userIds: string[] = [];
const eventIds: string[] = [];

afterAll(async () => {
  await prisma.adminEventReceipt.deleteMany({ where: { eventId: { in: eventIds } } });
  await prisma.adminEvent.deleteMany({ where: { id: { in: eventIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.reservation.deleteMany({ where: { id: { in: bookingIds } } });
  await prisma.adminUser.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe("durable admin events on PostgreSQL", () => {
  it("delivers committed cash order and booking once per account, including simultaneous tabs", async () => {
    const password = randomBytes(32).toString("base64url");
    const user = await createAdminUser(prisma, { login: `${prefix}-staff`, name: "Сотрудник", role: "staff", password });
    const second = await createAdminUser(prisma, { login: `${prefix}-other`, name: "Другой", role: "staff", password });
    userIds.push(user.id, second.id);

    await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({ data: { type: "pickup", itemsTotal: 100, total: 100, customerName: "Тест", customerPhone: "+7000" } });
      orderIds.push(order.id);
      await recordAdminEvent(tx, "order", order.id, `Заказ №${order.number}`);
      const booking = await tx.reservation.create({ data: { date: "2026-10-10", time: "15:00", guests: 2, customerName: "Тест", customerPhone: "+7000" } });
      bookingIds.push(booking.id);
      await recordAdminEvent(tx, "booking", booking.id, "Бронь 10 октября");
    });
    eventIds.push(...(await prisma.adminEvent.findMany({ where: { reference: { in: [...orderIds, ...bookingIds] } }, select: { id: true } })).map((event) => event.id));

    const [firstTab, secondTab] = await Promise.all([claimAdminEvents(prisma, user.id), claimAdminEvents(prisma, user.id)]);
    expect([...firstTab, ...secondTab].filter((event) => eventIds.includes(event.id))).toHaveLength(2);
    expect((await claimAdminEvents(prisma, user.id)).filter((event) => eventIds.includes(event.id))).toEqual([]);
    expect((await claimAdminEvents(prisma, second.id)).filter((event) => eventIds.includes(event.id))).toHaveLength(2);
  });

  it("creates no event for failed payment and one for the first successful payment", async () => {
    const failed = await prisma.order.create({ data: { type: "pickup", itemsTotal: 100, total: 100, paymentMethod: "online", paymentStatus: "pending", customerName: "Тест", customerPhone: "+7000" } });
    const paid = await prisma.order.create({ data: { type: "pickup", itemsTotal: 100, total: 100, paymentMethod: "online", paymentStatus: "pending", customerName: "Тест", customerPhone: "+7000" } });
    orderIds.push(failed.id, paid.id);
    expect(await applyPaymentEvent(prisma, { orderId: failed.id, paymentId: `p-${failed.id}`, status: "failed" })).toBe(false);
    expect(await applyPaymentEvent(prisma, { orderId: paid.id, paymentId: `p-${paid.id}`, status: "paid" })).toBe(true);
    expect(await applyPaymentEvent(prisma, { orderId: paid.id, paymentId: `p-${paid.id}`, status: "paid" })).toBe(false);
    const events = await prisma.adminEvent.findMany({ where: { kind: "order", reference: { in: [failed.id, paid.id] } } });
    expect(events.map((event) => event.reference)).toEqual([paid.id]);
    eventIds.push(...events.map((event) => event.id));
  });
});
