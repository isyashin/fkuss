import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { applyAdminOrderStatus } from "@/lib/order-status-service";

function fakeOrder(type: string, status: string, updatedCount = 1) {
  const order = { id: "order-1", number: 10, type, status, customerId: "customer-1", bonusAccrued: 50 };
  const updates: unknown[] = [];
  const ledger: { type: string; amount: number }[] = [];
  const tx = {
    order: {
      findUnique: async () => order,
      updateMany: async (args: { where: { status: string }; data: { status: string } }) => {
        updates.push(args);
        if (updatedCount) order.status = args.data.status;
        return { count: updatedCount };
      },
    },
    bonusTransaction: {
      findFirst: async ({ where }: { where: { type: string } }) => ledger.find((entry) => entry.type === where.type) ?? null,
      create: async ({ data }: { data: { type: string; amount: number } }) => { ledger.push({ type: data.type, amount: data.amount }); },
    },
  };
  const prisma = { $transaction: async (callback: (client: typeof tx) => Promise<void>) => callback(tx) } as unknown as PrismaClient;
  return { prisma, order, updates, ledger };
}

describe("admin order status service", () => {
  it("atomically advances pickup to issued and accrues its bonus", async () => {
    const { prisma, order, updates, ledger } = fakeOrder("pickup", "ready");
    await applyAdminOrderStatus(prisma, "order-1", "issued");
    expect(order.status).toBe("issued");
    expect(updates).toMatchObject([{ where: { id: "order-1", type: "pickup", status: "ready" }, data: { status: "issued" } }]);
    expect(ledger).toEqual([{ type: "accrual", amount: 50 }]);
  });

  it("rejects a skipped stage before writing", async () => {
    const { prisma, updates } = fakeOrder("delivery", "cooking");
    await expect(applyAdminOrderStatus(prisma, "order-1", "delivered")).rejects.toThrow("Недопустимый переход");
    expect(updates).toEqual([]);
  });

  it("rejects a concurrent stale update before loyalty changes", async () => {
    const { prisma, ledger } = fakeOrder("delivery", "handed_to_courier", 0);
    await expect(applyAdminOrderStatus(prisma, "order-1", "delivered")).rejects.toThrow("изменён другим оператором");
    expect(ledger).toEqual([]);
  });
});
