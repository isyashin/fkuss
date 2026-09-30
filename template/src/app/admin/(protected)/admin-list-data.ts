import type { PrismaClient } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";
import {
  ADMIN_PAGE_SIZE,
  bookingListCounts,
  orderListCounts,
  pageWindow,
  type BookingListQuery,
  type OrderListQuery,
} from "@/lib/admin-list-query";

export async function loadOrdersPage(prisma: PrismaClient, query: OrderListQuery) {
  const groups = await prisma.order.groupBy({ by: ["status", "type"], _count: { _all: true } });
  const counts = orderListCounts(groups, query.type, query.status);
  const window = pageWindow(counts.total, query.page);
  const where: Prisma.OrderWhereInput = {
    ...(query.status !== "all" ? { status: query.status } : {}),
    ...(query.type !== "all" ? { type: query.type } : {}),
  };
  const orders = await prisma.order.findMany({
    where,
    orderBy: [{ createdAt: query.sort }, { id: query.sort }],
    skip: window.skip,
    take: ADMIN_PAGE_SIZE,
    include: { items: true },
  });
  return { orders, counts, ...window };
}

export async function loadBookingsPage(prisma: PrismaClient, query: BookingListQuery) {
  const groups = await prisma.reservation.groupBy({ by: ["status"], _count: { _all: true } });
  const counts = bookingListCounts(groups);
  const total = counts[query.status];
  const window = pageWindow(total, query.page);
  const where: Prisma.ReservationWhereInput = query.status === "all" ? {} : { status: query.status };
  const bookings = await prisma.reservation.findMany({
    where,
    orderBy: [{ date: query.sort }, { time: query.sort }, { id: query.sort }],
    skip: window.skip,
    take: ADMIN_PAGE_SIZE,
  });
  return { bookings, counts, ...window };
}
