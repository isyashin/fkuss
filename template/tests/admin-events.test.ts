import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { claimAdminEvents, recordAdminEvent } from "@/lib/admin-events";
import { hasRecentAdminEvent } from "@/lib/admin-audio";

describe("admin event delivery", () => {
  it("sounds only for recent events while still showing older receipts", () => {
    const now = Date.parse("2026-09-25T12:00:00Z");
    expect(hasRecentAdminEvent([{ createdAt: "2026-09-25T11:56:00Z" }], now)).toBe(true);
    expect(hasRecentAdminEvent([{ createdAt: "2026-09-25T11:54:00Z" }], now)).toBe(false);
    expect(hasRecentAdminEvent([{ createdAt: "invalid" }], now)).toBe(false);
  });
  it("records the event in the caller's transaction", async () => {
    const created: unknown[] = [];
    const tx = { adminEvent: { create: async (args: unknown) => { created.push(args); } } } as unknown as PrismaClient;
    await recordAdminEvent(tx, "order", "order-1", "Заказ №1");
    expect(created).toEqual([{ data: { kind: "order", reference: "order-1", label: "Заказ №1" } }]);
  });

  it("claims each new event once per employee, even with two open tabs", async () => {
    const started = new Date("2026-09-25T12:00:00Z");
    const rows = [
      { id: "old", kind: "order", label: "Старый заказ", createdAt: new Date("2026-09-25T11:59:00Z") },
      { id: "new", kind: "booking", label: "Новая бронь", createdAt: new Date("2026-09-25T12:01:00Z") },
    ];
    const receipts = new Set<string>();
    const tx = {
      adminUser: { findUnique: async () => ({ createdAt: started, active: true }) },
      adminEvent: { findMany: async (args: { where: { createdAt: { gte: Date }; receipts: { none: { userId: string } } } }) =>
        rows.filter((row) => row.createdAt >= args.where.createdAt.gte && !receipts.has(`${args.where.receipts.none.userId}:${row.id}`)) },
      adminEventReceipt: { createManyAndReturn: async (args: { data: { eventId: string; userId: string }[] }) =>
        args.data.filter((entry) => {
          const key = `${entry.userId}:${entry.eventId}`;
          if (receipts.has(key)) return false;
          receipts.add(key);
          return true;
        }) },
    };
    const prisma = { $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) } as unknown as PrismaClient;
    const [firstTab, secondTab] = await Promise.all([claimAdminEvents(prisma, "staff-1"), claimAdminEvents(prisma, "staff-1")]);
    expect([...firstTab, ...secondTab].map((event) => event.id)).toEqual(["new"]);
    expect(await claimAdminEvents(prisma, "staff-1")).toEqual([]);
    expect((await claimAdminEvents(prisma, "staff-2")).map((event) => event.id)).toEqual(["new"]);
  });
});
