import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { applyPaymentEvent } from "@/lib/payments/apply-event";

function paymentDb(initialStatus: string, initialPayment = "pending", conflictOnce = false) {
  const order = { id: "order-1", number: 123, status: initialStatus, paymentStatus: initialPayment, paymentMethod: "online", paymentId: null as string | null };
  const updates: unknown[] = [];
  const events: unknown[] = [];
  let stale = conflictOnce;
  const tx = { adminEvent: { create: async (args: unknown) => { events.push(args); } }, order: {
    findUnique: async () => order,
    updateMany: async (args: { where: { status: string }; data: { status: string; paymentStatus: string; paymentId: string } }) => {
      updates.push(args);
      if (stale) { stale = false; order.status = "ready"; return { count: 0 }; }
      order.status = args.data.status;
      order.paymentStatus = args.data.paymentStatus;
      order.paymentId = args.data.paymentId;
      return { count: 1 };
    },
  } };
  const prisma = { $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) } as unknown as PrismaClient;
  return { prisma, order, updates, events };
}

describe("payment event and order status", () => {
  it("accepts a newly paid order once", async () => {
    const { prisma, order, updates, events } = paymentDb("new");
    expect(await applyPaymentEvent(prisma, { orderId: "order-1", paymentId: "payment-1", status: "paid" })).toBe(true);
    expect(order).toMatchObject({ status: "accepted", paymentStatus: "paid", paymentId: "payment-1" });
    expect(updates).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ data: { kind: "order", reference: "order-1", label: "Заказ №123" } });
  });

  it("does not roll back an already progressing order", async () => {
    const { prisma, order } = paymentDb("handed_to_courier");
    await applyPaymentEvent(prisma, { orderId: "order-1", paymentId: "payment-1", status: "paid" });
    expect(order.status).toBe("handed_to_courier");
  });

  it("records failure without accepting the order", async () => {
    const { prisma, order, events } = paymentDb("new");
    expect(await applyPaymentEvent(prisma, { orderId: "order-1", paymentId: "payment-1", status: "failed" })).toBe(false);
    expect(order).toMatchObject({ status: "new", paymentStatus: "failed" });
    expect(events).toHaveLength(0);
  });

  it("ignores a duplicate final payment event", async () => {
    const { prisma, updates } = paymentDb("accepted", "paid");
    expect(await applyPaymentEvent(prisma, { orderId: "order-1", paymentId: "payment-1", status: "paid" })).toBe(false);
    expect(updates).toHaveLength(0);
  });

  it("does not mark a cash order paid from an unrelated event", async () => {
    const { prisma, order, updates } = paymentDb("new", "none");
    order.paymentMethod = "cash";
    expect(await applyPaymentEvent(prisma, { orderId: "order-1", paymentId: "payment-1", status: "paid" })).toBe(false);
    expect(updates).toHaveLength(0);
  });

  it("retries after a concurrent admin transition without moving status backward", async () => {
    const { prisma, order, updates } = paymentDb("new", "pending", true);
    expect(await applyPaymentEvent(prisma, { orderId: "order-1", paymentId: "payment-1", status: "paid" })).toBe(true);
    expect(updates).toHaveLength(2);
    expect(order.status).toBe("ready");
  });
});
