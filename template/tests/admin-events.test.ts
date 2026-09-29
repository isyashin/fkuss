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

  it("claims each new event for every tab of an employee, once per tab", async () => {
    const started = new Date("2026-09-25T12:00:00Z");
    const rows = [
      { id: "old", kind: "order", label: "Старый заказ", createdAt: new Date("2026-09-25T11:59:00Z"), reference: "order-1" },
      { id: "new", kind: "booking", label: "Новая бронь", createdAt: new Date("2026-09-25T12:01:00Z"), reference: "booking-1" },
    ];
    const receipts = new Set<string>();
    const tx = {
      adminUser: { findUnique: async () => ({ createdAt: started, active: true }) },
      adminEvent: { findMany: async (args: { where: { createdAt: { gte: Date }; receipts: { none: { userId: string; tabId: string } } } }) =>
        rows.filter((row) => row.createdAt >= args.where.createdAt.gte &&
          !receipts.has(`${args.where.receipts.none.userId}:${args.where.receipts.none.tabId}:${row.id}`)) },
      adminEventReceipt: {
        createManyAndReturn: async (args: { data: { eventId: string; userId: string; tabId: string }[] }) =>
          args.data.filter((entry) => {
            const key = `${entry.userId}:${entry.tabId}:${entry.eventId}`;
            if (receipts.has(key)) return false;
            receipts.add(key);
            return true;
          }),
        deleteMany: async () => ({ count: 0 }),
      },
      order: { findMany: async () => [{ id: "order-1", status: "new" }] },
      reservation: { findMany: async () => [{ id: "booking-1", status: "new" }] },
    };
    const prisma = { $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) } as unknown as PrismaClient;

    // Две вкладки одной учётки — обе получают событие; повтор той же вкладки — пусто
    expect((await claimAdminEvents(prisma, "staff-1", "tab-a")).map((event) => event.id)).toEqual(["new"]);
    expect((await claimAdminEvents(prisma, "staff-1", "tab-b")).map((event) => event.id)).toEqual(["new"]);
    expect(await claimAdminEvents(prisma, "staff-1", "tab-a")).toEqual([]);
    // Событие приезжает с текущим статусом ссылки
    const claimed = await claimAdminEvents(prisma, "staff-2", "tab-a");
    expect(claimed.find((event) => event.id === "new")?.status).toBe("new");
    expect((await claimAdminEvents(prisma, "staff-2", "tab-a"))).toEqual([]);
  });
});
