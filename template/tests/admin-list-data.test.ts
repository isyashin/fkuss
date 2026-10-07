import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { loadBookingsPage, loadOrdersPage } from "@/app/admin/(protected)/admin-list-data";

describe("admin database page requests", () => {
  it("fetches one bounded order page with server filters and stable sorting", async () => {
    let request: Record<string, unknown> = {};
    const prisma = { order: {
      groupBy: async () => [
        { status: "new", type: "delivery", _count: { _all: 62 } },
        { status: "new", type: "pickup", _count: { _all: 8 } },
      ],
      findMany: async (args: Record<string, unknown>) => { request = args; return [{ id: "last-page" }]; },
    } } as unknown as PrismaClient;

    const result = await loadOrdersPage(prisma, { status: "new", type: "delivery", sort: "asc", page: 3, mode: "all", q: "" });
    expect(result).toMatchObject({ page: 3, pageCount: 3, counts: { total: 62, byStatus: { all: 62, new: 62 }, byType: { all: 70, delivery: 62, pickup: 8 } } });
    expect(result.orders).toHaveLength(1);
    expect(request).toMatchObject({ where: { status: "new", type: "delivery" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: 50, take: 25, include: { items: true } });
  });

  it("ищет заказы по имени, телефону и точному номеру", async () => {
    let request: Record<string, unknown> = {};
    const prisma = { order: {
      groupBy: async () => [],
      findMany: async (args: Record<string, unknown>) => { request = args; return []; },
    } } as unknown as PrismaClient;

    await loadOrdersPage(prisma, { status: "all", type: "all", sort: "desc", page: 1, mode: "all", q: "7999" });
    expect(request.where).toEqual({ OR: [
      { customerName: { contains: "7999", mode: "insensitive" } },
      { customerPhone: { contains: "7999" } },
      { number: { equals: 7999 } },
    ] });

    // Не-цифровой запрос не ищет по числовому номеру.
    await loadOrdersPage(prisma, { status: "all", type: "all", sort: "desc", page: 1, mode: "all", q: "Иван" });
    expect(request.where).toEqual({ OR: [
      { customerName: { contains: "Иван", mode: "insensitive" } },
      { customerPhone: { contains: "Иван" } },
    ] });
  });

  it("брони: режимы Предстоящие/Ожидают/История и поиск по имени и телефону", async () => {
    const requests: Record<string, unknown>[] = [];
    const prisma = { reservation: {
      count: async (args: Record<string, unknown>) => { requests.push({ count: args }); return 12; },
      findMany: async (args: Record<string, unknown>) => { requests.push({ findMany: args }); return [{ id: "b1" }]; },
    } } as unknown as PrismaClient;

    const query = { mode: "upcoming" as const, q: "", sort: "desc" as const, page: 1 };
    const result = await loadBookingsPage(prisma, query, "2026-10-07");
    expect(result.pageCount).toBe(1);
    expect(result.total).toBe(12);
    const upcomingWhere = (requests.find((r) => r.findMany) as { findMany: { where: unknown } }).findMany.where;
    expect(upcomingWhere).toEqual({ status: { in: ["new", "confirmed"] }, date: { gte: "2026-10-07" } });
    expect((requests.find((r) => r.findMany) as { findMany: { orderBy: unknown } }).findMany.orderBy).toEqual([{ date: "asc" }, { time: "asc" }, { id: "asc" }]);
    expect(result.counts.upcoming).toBe(12);

    requests.length = 0;
    await loadBookingsPage(prisma, { ...query, mode: "history", q: "7999" }, "2026-10-07");
    const history = (requests.find((r) => r.findMany) as { findMany: { where: unknown; orderBy: unknown } }).findMany;
    expect(history.where).toEqual({
      AND: [
        { OR: [{ status: { in: ["rejected", "cancelled"] } }, { date: { lt: "2026-10-07" } }] },
        { OR: [{ customerName: { contains: "7999", mode: "insensitive" } }, { customerPhone: { contains: "7999" } }] },
      ],
    });
    expect(history.orderBy).toEqual([{ date: "desc" }, { time: "desc" }, { id: "desc" }]);
  });
});
