import type { PrismaClient } from "@/generated/prisma/client";
import type { Prisma } from "@/generated/prisma/client";
import {
  ADMIN_PAGE_SIZE,
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

export async function loadBookingsPage(prisma: PrismaClient, query: BookingListQuery, today: string) {
  // Режимы по макету: Предстоящие (new/confirmed с сегодняшнего дня, в часовом
  // поясе ресторана), Ожидают (новые предстоящие), История (старые и отклонённые).
  const modeWhere: Prisma.ReservationWhereInput = query.mode === "upcoming"
    ? { status: { in: ["new", "confirmed"] }, date: { gte: today } }
    : query.mode === "new"
      ? { status: "new", date: { gte: today } }
      : { OR: [{ status: { in: ["rejected", "cancelled"] } }, { date: { lt: today } }] };
  const searchWhere: Prisma.ReservationWhereInput = query.q
    ? { OR: [
        { customerName: { contains: query.q, mode: "insensitive" } },
        { customerPhone: { contains: query.q } },
      ] }
    : {};
  const where: Prisma.ReservationWhereInput = Object.keys(searchWhere).length ? { AND: [modeWhere, searchWhere] } : modeWhere;
  const total = await prisma.reservation.count({ where });
  const window = pageWindow(total, query.page);
  const [upcoming, pending, historyCount] = await Promise.all([
    prisma.reservation.count({ where: { status: { in: ["new", "confirmed"] }, date: { gte: today } } }),
    prisma.reservation.count({ where: { status: "new", date: { gte: today } } }),
    prisma.reservation.count({ where: { OR: [{ status: { in: ["rejected", "cancelled"] } }, { date: { lt: today } }] } }),
  ]);
  const ascending = query.mode !== "history";
  const bookings = await prisma.reservation.findMany({
    where,
    orderBy: [{ date: ascending ? "asc" : "desc" }, { time: ascending ? "asc" : "desc" }, { id: ascending ? "asc" : "desc" }],
    skip: window.skip,
    take: ADMIN_PAGE_SIZE,
  });
  return { bookings, counts: { upcoming, pending, history: historyCount }, total, ...window };
}
