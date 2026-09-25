import { afterAll, describe, expect, it } from "vitest";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { applyAdminOrderStatus } from "@/lib/order-status-service";
import { applyPaymentEvent } from "@/lib/payments/apply-event";

// Запускать только на одноразовой БД или проверенной временной копии.
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function createOrder(type: "delivery" | "pickup", online: boolean, bonusSpent = 0) {
  const customer = await prisma.customer.create({ data: { email: `status-${crypto.randomUUID()}@example.com`, name: "Тест", phone: "+7000" } });
  const order = await prisma.order.create({
    data: {
      customerId: customer.id, type, status: "new", itemsTotal: 1000, total: 1000 - bonusSpent,
      bonusSpent, bonusAccrued: 50, paymentMethod: online ? "online" : "cash",
      paymentStatus: online ? "pending" : "none", customerName: "Тест", customerPhone: "+7000",
      items: { create: [{ dishId: "integration-test", name: "Тест", price: 1000, quantity: 1, total: 1000 }] },
    },
  });
  return { customerId: customer.id, orderId: order.id };
}

async function cleanup(customerId: string, orderId: string) {
  await prisma.bonusTransaction.deleteMany({ where: { orderId } });
  await prisma.orderItem.deleteMany({ where: { orderId } });
  await prisma.order.delete({ where: { id: orderId } });
  await prisma.customer.delete({ where: { id: customerId } });
}

afterAll(async () => { await prisma.$disconnect(); });

describe("canonical order flow against PostgreSQL", () => {
  it("accepts online payment and accrues bonus only after delivery", async () => {
    const { customerId, orderId } = await createOrder("delivery", true);
    try {
      expect(await applyPaymentEvent(prisma, { orderId, paymentId: `test-${orderId}`, status: "paid" })).toBe(true);
      expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("accepted");
      for (const status of ["cooking", "ready", "handed_to_courier"] as const) {
        await applyAdminOrderStatus(prisma, orderId, status);
        expect(await prisma.bonusTransaction.count({ where: { orderId, type: "accrual" } })).toBe(0);
      }
      await applyAdminOrderStatus(prisma, orderId, "delivered");
      expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("delivered");
      expect(await prisma.bonusTransaction.findMany({ where: { orderId, type: "accrual" }, select: { amount: true } })).toEqual([{ amount: 50 }]);
      expect(await applyPaymentEvent(prisma, { orderId, paymentId: `test-${orderId}`, status: "paid" })).toBe(false);
    } finally { await cleanup(customerId, orderId); }
  });

  it("cancels pickup and refunds spent bonuses once", async () => {
    const { customerId, orderId } = await createOrder("pickup", false, 20);
    try {
      await prisma.bonusTransaction.create({ data: { customerId, orderId, type: "spend", amount: -20 } });
      await applyAdminOrderStatus(prisma, orderId, "cancelled");
      expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("cancelled");
      expect(await prisma.bonusTransaction.findMany({ where: { orderId }, orderBy: { createdAt: "asc" }, select: { type: true, amount: true } })).toEqual([
        { type: "spend", amount: -20 }, { type: "refund", amount: 20 },
      ]);
      await expect(applyAdminOrderStatus(prisma, orderId, "cancelled")).rejects.toThrow("Недопустимый переход");
    } finally { await cleanup(customerId, orderId); }
  });
});
