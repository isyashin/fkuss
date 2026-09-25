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

    const result = await loadOrdersPage(prisma, { status: "new", type: "delivery", sort: "asc", page: 3 });
    expect(result).toMatchObject({ page: 3, pageCount: 3, counts: { total: 62, byStatus: { all: 62, new: 62 }, byType: { all: 70, delivery: 62, pickup: 8 } } });
    expect(result.orders).toHaveLength(1);
    expect(request).toMatchObject({ where: { status: "new", type: "delivery" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: 50, take: 25, include: { items: true } });
  });

  it("clamps booking pages after filtering and never requests unbounded history", async () => {
    let request: Record<string, unknown> = {};
    const prisma = { reservation: {
      groupBy: async () => [
        { status: "new", _count: { _all: 4 } },
        { status: "confirmed", _count: { _all: 105 } },
      ],
      findMany: async (args: Record<string, unknown>) => { request = args; return [{ id: "new-booking" }]; },
    } } as unknown as PrismaClient;

    const result = await loadBookingsPage(prisma, { status: "new", sort: "desc", page: 8 });
    expect(result).toMatchObject({ page: 1, pageCount: 1, counts: { all: 109, new: 4, confirmed: 105 } });
    expect(request).toMatchObject({ where: { status: "new" }, orderBy: [{ date: "desc" }, { time: "desc" }, { id: "desc" }], skip: 0, take: 25 });
  });
});
