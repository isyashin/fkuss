import { randomBytes } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { createAdminUser } from "@/lib/admin-users";
import { recordAdminEvent } from "@/lib/admin-events";
import { applyPaymentEvent } from "@/lib/payments/apply-event";
import { processPushDeliveries, type PushTransport } from "@/lib/admin-push";

// Только одноразовая PostgreSQL после миграции 0012_admin_push.
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const prefix = `push-${crypto.randomUUID()}`;
const orderIds: string[] = [];
const bookingIds: string[] = [];
const userIds: string[] = [];
const eventIds: string[] = [];
const subscriptionIds: string[] = [];

const ep = (name: string) => `https://push.test/${prefix}-${name}`;

/** Все подписки префикса отзываем — фан-аут новых событий достаётся только свежим подпискам теста. */
async function revokeAll() {
  await prisma.adminPushSubscription.updateMany({
    where: { revokedAt: null, endpoint: { startsWith: `https://push.test/${prefix}` } },
    data: { revokedAt: new Date() },
  });
}

async function makeUserWithSubscription(name: string, endpoint: string, revoked = false) {
  const password = randomBytes(32).toString("base64url");
  const user = await createAdminUser(prisma, { login: `${prefix}-${name}`, name, role: "staff", password });
  userIds.push(user.id);
  const subscription = await prisma.adminPushSubscription.create({
    data: {
      userId: user.id,
      endpoint,
      p256dh: "key-p256dh",
      auth: "key-auth",
      installId: `install-${name}`,
      userAgent: "vitest",
      ...(revoked ? { revokedAt: new Date() } : {}),
    },
  });
  subscriptionIds.push(subscription.id);
  return { user, subscription };
}

/** Событие через recordAdminEvent — доставки ставятся в той же транзакции для активных подписок. */
async function makeEvent(kind: "order" | "booking", reference: string, label: string) {
  await prisma.$transaction(async (tx) => {
    await recordAdminEvent(tx, kind, reference, label);
  });
  const event = await prisma.adminEvent.findUniqueOrThrow({ where: { kind_reference: { kind, reference } } });
  eventIds.push(event.id);
  return event;
}

afterAll(async () => {
  await prisma.adminPushDelivery.deleteMany({ where: { subscriptionId: { in: subscriptionIds } } });
  await prisma.adminPushSubscription.deleteMany({ where: { id: { in: subscriptionIds } } });
  await prisma.adminEventReceipt.deleteMany({ where: { eventId: { in: eventIds } } });
  await prisma.adminEvent.deleteMany({ where: { id: { in: eventIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.reservation.deleteMany({ where: { id: { in: bookingIds } } });
  await prisma.adminUser.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe("push-доставка поверх AdminEvent", () => {
  it("ставит доставки в ту же транзакцию, что и событие: только активным подпискам; rollback оставляет обе таблицы пустыми", async () => {
    const { subscription } = await makeUserWithSubscription("sa", ep("a"));
    const revoked = await makeUserWithSubscription("sr", ep("revoked"), true);
    const inactive = await makeUserWithSubscription("si", ep("inactive"));
    await prisma.adminUser.update({ where: { id: inactive.user.id }, data: { active: false } });

    let orderId = "";
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.create({ data: { type: "pickup", itemsTotal: 100, total: 100, customerName: "Тест", customerPhone: "+7000" } });
      orderId = order.id;
      orderIds.push(order.id);
      await recordAdminEvent(tx, "order", order.id, `Заказ №${order.number}`);
    });

    const deliveries = await prisma.adminPushDelivery.findMany({ where: { event: { reference: orderId } } });
    expect(deliveries.map((d) => d.subscriptionId)).toEqual([subscription.id]);
    expect(deliveries[0].status).toBe("pending");

    // Откат транзакции создания события не должен оставить ни события, ни доставок
    let rolledBackBookingId = "";
    await expect(
      prisma.$transaction(async (tx) => {
        const booking = await tx.reservation.create({ data: { date: "2026-10-10", time: "15:00", guests: 2, customerName: "Тест", customerPhone: "+7000" } });
        rolledBackBookingId = booking.id;
        bookingIds.push(booking.id);
        await recordAdminEvent(tx, "booking", booking.id, "Бронь 10 октября");
        throw new Error("rollback-test");
      }),
    ).rejects.toThrow("rollback-test");
    expect(await prisma.adminEvent.count({ where: { reference: rolledBackBookingId } })).toBe(0);
    expect(await prisma.adminPushDelivery.count({ where: { subscriptionId: { in: [subscription.id, revoked.subscription.id, inactive.subscription.id] } } })).toBe(1);
  });

  it("онлайн-заказ молчит до оплаты; первый paid-webhook ставит доставки ровно один раз", async () => {
    await revokeAll();
    const { subscription } = await makeUserWithSubscription("sp", ep("pay"));

    const paid = await prisma.order.create({ data: { type: "pickup", itemsTotal: 100, total: 100, paymentMethod: "online", paymentStatus: "pending", customerName: "Тест", customerPhone: "+7000" } });
    orderIds.push(paid.id);
    expect(await prisma.adminEvent.count({ where: { kind: "order", reference: paid.id } })).toBe(0);
    expect(await prisma.adminPushDelivery.count({ where: { event: { reference: paid.id } } })).toBe(0);

    expect(await applyPaymentEvent(prisma, { orderId: paid.id, paymentId: `p-${paid.id}`, status: "paid" })).toBe(true);
    const deliveries = await prisma.adminPushDelivery.findMany({ where: { event: { reference: paid.id }, subscriptionId: subscription.id } });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].status).toBe("pending");

    // Повтор webhook → новых записей нет
    expect(await applyPaymentEvent(prisma, { orderId: paid.id, paymentId: `p-${paid.id}`, status: "paid" })).toBe(false);
    expect(await prisma.adminPushDelivery.count({ where: { event: { reference: paid.id } } })).toBe(1);
    expect(await prisma.adminEvent.count({ where: { kind: "order", reference: paid.id } })).toBe(1);

    // failed-webhook события не создаёт
    const failed = await prisma.order.create({ data: { type: "pickup", itemsTotal: 100, total: 100, paymentMethod: "online", paymentStatus: "pending", customerName: "Тест", customerPhone: "+7000" } });
    orderIds.push(failed.id);
    expect(await applyPaymentEvent(prisma, { orderId: failed.id, paymentId: `p-${failed.id}`, status: "failed" })).toBe(false);
    expect(await prisma.adminEvent.count({ where: { kind: "order", reference: failed.id } })).toBe(0);
  });

  it("новая бронь ставит доставки вместе с событием", async () => {
    await revokeAll();
    const { subscription } = await makeUserWithSubscription("sb", ep("booking"));
    const booking = await prisma.reservation.create({ data: { date: "2026-10-11", time: "18:00", guests: 3, customerName: "Тест", customerPhone: "+7000" } });
    bookingIds.push(booking.id);
    await makeEvent("booking", booking.id, "Бронь 11 октября");
    const deliveries = await prisma.adminPushDelivery.findMany({ where: { event: { reference: booking.id } } });
    expect(deliveries.map((d) => d.subscriptionId)).toEqual([subscription.id]);
  });
});

describe("процессор доставок (job push-delivery)", () => {
  it("шлёт pending, пропускает обработанное и протухшее, отзывает по 410, ретраит временный сбой с backoff", async () => {
    await revokeAll();
    const { subscription } = await makeUserWithSubscription("sj", ep("job"));
    const calls: { endpoint: string; payload: unknown }[] = [];
    const okTransport: PushTransport = {
      async send(sub, payload) {
        calls.push({ endpoint: sub.endpoint, payload });
      },
    };

    // cash new → отправка
    const cash = await prisma.order.create({ data: { type: "pickup", itemsTotal: 100, total: 100, customerName: "Тест", customerPhone: "+7000" } });
    orderIds.push(cash.id);
    const cashEvent = await makeEvent("order", cash.id, `Заказ №${cash.number}`);

    // онлайн после оплаты (accepted) → ещё актуально, отправка
    const online = await prisma.order.create({ data: { type: "pickup", itemsTotal: 100, total: 100, paymentMethod: "online", paymentStatus: "paid", status: "accepted", customerName: "Тест", customerPhone: "+7000" } });
    orderIds.push(online.id);
    const onlineEvent = await makeEvent("order", online.id, `Заказ №${online.number}`);

    // cash уже принят → expired без отправки
    const processed = await prisma.order.create({ data: { type: "pickup", itemsTotal: 100, total: 100, status: "accepted", customerName: "Тест", customerPhone: "+7000" } });
    orderIds.push(processed.id);
    const processedEvent = await makeEvent("order", processed.id, `Заказ №${processed.number}`);

    // бронь уже подтверждена → expired без отправки
    const confirmed = await prisma.reservation.create({ data: { date: "2026-10-12", time: "19:00", guests: 2, customerName: "Тест", customerPhone: "+7000", status: "confirmed" } });
    bookingIds.push(confirmed.id);
    const confirmedEvent = await makeEvent("booking", confirmed.id, "Бронь 12 октября");

    // событие старше TTL → expired без отправки
    const staleOrder = await prisma.order.create({ data: { type: "pickup", itemsTotal: 100, total: 100, customerName: "Тест", customerPhone: "+7000" } });
    orderIds.push(staleOrder.id);
    const staleEvent = await prisma.adminEvent.create({
      data: { kind: "order", reference: staleOrder.id, label: `Заказ №${staleOrder.number}`, createdAt: new Date(Date.now() - 25 * 3600 * 1000) },
    });
    eventIds.push(staleEvent.id);
    await prisma.adminPushDelivery.create({ data: { eventId: staleEvent.id, subscriptionId: subscription.id } });

    const sentCash = await processPushDeliveries(prisma, { transport: okTransport, eventId: cashEvent.id });
    expect(sentCash.sent).toBe(1);
    const sentOnline = await processPushDeliveries(prisma, { transport: okTransport, eventId: onlineEvent.id });
    expect(sentOnline.sent).toBe(1);
    const skipProcessed = await processPushDeliveries(prisma, { transport: okTransport, eventId: processedEvent.id });
    expect(skipProcessed.expired).toBe(1);
    const skipBooking = await processPushDeliveries(prisma, { transport: okTransport, eventId: confirmedEvent.id });
    expect(skipBooking.expired).toBe(1);
    const skipStale = await processPushDeliveries(prisma, { transport: okTransport, eventId: staleEvent.id });
    expect(skipStale.expired).toBe(1);
    expect(calls).toHaveLength(2);
    expect((calls[0].payload as { kind: string }).kind).toBe("order");

    // 410 → отзыв подписки + expired
    const { subscription: gone } = await makeUserWithSubscription("sg", ep("gone"));
    const goneOrder = await prisma.order.create({ data: { type: "pickup", itemsTotal: 100, total: 100, customerName: "Тест", customerPhone: "+7000" } });
    orderIds.push(goneOrder.id);
    const goneEvent = await makeEvent("order", goneOrder.id, `Заказ №${goneOrder.number}`);
    const goneResult = await processPushDeliveries(prisma, {
      transport: {
        async send(sub) {
          if (sub.endpoint === ep("gone")) throw Object.assign(new Error("gone"), { statusCode: 410 });
        },
      },
      eventId: goneEvent.id,
    });
    expect(goneResult.sent).toBe(1); // job-подписка ещё активна
    expect(goneResult.revoked).toBe(1);
    expect(goneResult.expired).toBe(1);
    const revokedSub = await prisma.adminPushSubscription.findUniqueOrThrow({ where: { id: gone.id } });
    expect(revokedSub.revokedAt).not.toBeNull();

    // Временный сбой → retry с backoff; потом failed после исчерпания попыток
    const { subscription: flaky } = await makeUserWithSubscription("sf", ep("flaky"));
    const flakyOrder = await prisma.order.create({ data: { type: "pickup", itemsTotal: 100, total: 100, customerName: "Тест", customerPhone: "+7000" } });
    orderIds.push(flakyOrder.id);
    const flakyEvent = await makeEvent("order", flakyOrder.id, `Заказ №${flakyOrder.number}`);
    const flakyResult = await processPushDeliveries(prisma, {
      transport: {
        async send(sub) {
          if (sub.endpoint === ep("flaky")) throw new Error("network down");
        },
      },
      eventId: flakyEvent.id,
    });
    expect(flakyResult.sent).toBe(1); // job-подписка
    expect(flakyResult.retried).toBe(1);

    const flakyDelivery = await prisma.adminPushDelivery.findUniqueOrThrow({
      where: { eventId_subscriptionId: { eventId: flakyEvent.id, subscriptionId: flaky.id } },
    });
    expect(flakyDelivery.status).toBe("pending");
    expect(flakyDelivery.attempts).toBe(1);
    expect(flakyDelivery.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

    // До наступления backoff-времени не трогаем
    const immediate = await processPushDeliveries(prisma, { transport: okTransport, eventId: flakyEvent.id });
    expect(immediate.claimed).toBe(0);

    await prisma.adminPushDelivery.update({
      where: { eventId_subscriptionId: { eventId: flakyEvent.id, subscriptionId: flaky.id } },
      data: { nextAttemptAt: new Date(Date.now() - 1000), attempts: 8 },
    });
    const final = await processPushDeliveries(prisma, {
      transport: {
        async send() {
          throw new Error("still down");
        },
      },
      eventId: flakyEvent.id,
    });
    expect(final.failed).toBe(1);
  });

  it("две параллельные job не отправляют одну доставку дважды", async () => {
    await revokeAll();
    const { subscription } = await makeUserWithSubscription("srace", ep("race"));

    const order = await prisma.order.create({ data: { type: "pickup", itemsTotal: 100, total: 100, customerName: "Тест", customerPhone: "+7000" } });
    orderIds.push(order.id);
    const event = await makeEvent("order", order.id, `Заказ №${order.number}`);
    await prisma.adminPushDelivery.updateMany({
      where: { eventId: event.id, subscriptionId: subscription.id },
      data: { nextAttemptAt: new Date(Date.now() - 1000) },
    });

    let entered = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const transport: PushTransport = {
      async send() {
        entered += 1;
        await gate; // «отправка» висит, пока второй процессор не пройдёт своё окно claim
      },
    };
    // Как только первая job захватила строку (status → sending), отпускаем отправку
    const watcher = (async () => {
      for (let i = 0; i < 150; i++) {
        const row = await prisma.adminPushDelivery.findUnique({
          where: { eventId_subscriptionId: { eventId: event.id, subscriptionId: subscription.id } },
          select: { status: true },
        });
        if (row?.status === "sending") break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      release();
    })();

    const [a, b] = await Promise.all([
      processPushDeliveries(prisma, { transport, limit: 10 }),
      processPushDeliveries(prisma, { transport, limit: 10 }),
      watcher,
    ]);
    expect(a.sent + b.sent).toBe(1);
    expect(entered).toBe(1);
  }, 15_000);

  it("cleanup удаляет завершённые доставки старше TTL", async () => {
    await revokeAll();
    const { subscription } = await makeUserWithSubscription("sc", ep("clean"));
    const order = await prisma.order.create({ data: { type: "pickup", itemsTotal: 100, total: 100, customerName: "Тест", customerPhone: "+7000" } });
    orderIds.push(order.id);
    const event = await prisma.adminEvent.create({ data: { kind: "order", reference: order.id, label: `Заказ №${order.number}`, createdAt: new Date(Date.now() - 8 * 24 * 3600 * 1000) } });
    eventIds.push(event.id);
    await prisma.adminPushDelivery.create({
      data: {
        eventId: event.id,
        subscriptionId: subscription.id,
        status: "sent",
        attempts: 1,
        sentAt: new Date(Date.now() - 8 * 24 * 3600 * 1000),
        nextAttemptAt: new Date(Date.now() - 8 * 24 * 3600 * 1000),
        updatedAt: new Date(Date.now() - 8 * 24 * 3600 * 1000),
      },
    });
    await processPushDeliveries(prisma, { transport: { async send() {} }, limit: 10 });
    expect(await prisma.adminPushDelivery.count({ where: { eventId: event.id } })).toBe(0);
  });
});
