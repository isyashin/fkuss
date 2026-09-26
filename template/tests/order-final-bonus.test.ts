import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { accrueOrderBonus } from "@/lib/loyalty";

function ledgerFor(type: string, status: string) {
  const entries: { type: string; amount: number }[] = [];
  const prisma = {
    order: { findUnique: async () => ({ id: "order-1", number: 7, customerId: "customer-1", bonusAccrued: 50, type, status }) },
    bonusTransaction: {
      findFirst: async ({ where }: { where: { type: string } }) => entries.find((entry) => entry.type === where.type) ?? null,
      create: async ({ data }: { data: { type: string; amount: number } }) => { entries.push({ type: data.type, amount: data.amount }); },
    },
  } as unknown as PrismaClient;
  return { prisma, entries };
}

describe("bonus accrual at canonical final states", () => {
  it.each([["delivery", "delivered"], ["pickup", "issued"]])("accrues once for %s %s", async (type, status) => {
    const { prisma, entries } = ledgerFor(type, status);
    await accrueOrderBonus(prisma, "order-1");
    await accrueOrderBonus(prisma, "order-1");
    expect(entries).toEqual([{ type: "accrual", amount: 50 }]);
  });

  it.each([["delivery", "ready"], ["pickup", "ready"], ["delivery", "cancelled"], ["pickup", "delivered"]])("does not accrue for %s %s", async (type, status) => {
    const { prisma, entries } = ledgerFor(type, status);
    await accrueOrderBonus(prisma, "order-1");
    expect(entries).toEqual([]);
  });
});
