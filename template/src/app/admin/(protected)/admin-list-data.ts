import type { PrismaClient } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";
import {
  ADMIN_PAGE_SIZE,
  bookingListCounts,
  orderListCounts,
  pageWindow,
  ORDER_MODE_STATUSES,
  type BookingListQuery,
  type OrderListQuery,
} from "@/lib/admin-list-query";

export async function loadOrdersPage(prisma: PrismaClient, query: OrderListQuery) {
  // Поиск по номеру, имени и телефону — только в рамках текущего тенанта (Prisma tenant-изоляция).
  const searchWhere: Prisma.OrderWhereInput = query.q
    ? {
        OR: [
          { customerName: { contains: query.q, mode: "insensitive" } },
          { customerPhone: { contains: query.q } },
          ...( /^\d+$/.test(query.q) ? [{ number: { equals: Number(query.q) } }] : []),
        ],
      }
    : {};
  const groups = await prisma.order.groupBy({ by: ["status", "type"], where: searchWhere, _count: { _all: true } });
  const counts = orderListCounts(groups, query.type, query.status);
  const total = query.mode !== "all" ? counts.byMode[query.mode] : counts.total;
  const window = pageWindow(total, query.page);
  const where: Prisma.OrderWhereInput = {
    ...searchWhere,
    ...(query.mode !== "all"
      ? { status: { in: ORDER_MODE_STATUSES[query.mode] } }
      : query.status !== "all" ? { status: query.status } : {}),
    ...(query.type !== "all" ? { type: query.type } : {}),
  };
  const orders = await prisma.order.findMany({
    where,
    orderBy: [{ createdAt: query.sort }, { id: query.sort }],
    skip: window.skip,
    take: ADMIN_PAGE_SIZE,
    include: { items: true },
  });
  // total — в терминах активного режима/фильтра, чтобы пагинатор не расходился со списком.
  return { orders, counts: { ...counts, total }, ...window };
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
