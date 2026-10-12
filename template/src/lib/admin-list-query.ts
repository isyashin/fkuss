import { ORDER_STATUS_CODES } from "./order-status";

export const ADMIN_PAGE_SIZE = 25;

export const ORDER_STATUSES = ["all", ...ORDER_STATUS_CODES] as const;
export const BOOKING_MODES = ["upcoming", "new", "history"] as const;
export const ORDER_TYPES = ["all", "delivery", "pickup"] as const;
// Режимы очереди заказов (редизайн staff-экрана): группы статусов.
export const ORDER_MODES = ["all", "current", "new", "history"] as const;
export const ORDER_MODE_STATUSES: Record<Exclude<OrderModeFilter, "all">, string[]> = {
  current: ["new", "accepted", "cooking", "ready", "handed_to_courier"],
  new: ["new"],
  history: ["delivered", "issued", "cancelled"],
};

export type RawAdminQuery = Record<string, string | string[] | undefined>;
export type OrderStatusFilter = typeof ORDER_STATUSES[number];
export type BookingModeFilter = typeof BOOKING_MODES[number];
export type OrderTypeFilter = typeof ORDER_TYPES[number];
export type OrderModeFilter = typeof ORDER_MODES[number];
export type SortDirection = "asc" | "desc";
export type OrderListQuery = { status: OrderStatusFilter; type: OrderTypeFilter; sort: SortDirection; page: number; mode: OrderModeFilter; q: string };
export type BookingListQuery = { mode: BookingModeFilter; sort: SortDirection; page: number; q: string };

function scalar(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function oneOf<T extends string>(value: string | undefined, choices: readonly T[], fallback: T): T {
  return value && choices.includes(value as T) ? value as T : fallback;
}

function pageNumber(value: string | undefined): number {
  if (!value || !/^[1-9]\d*$/.test(value)) return 1;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : 1;
}

export function parseOrderListQuery(raw: RawAdminQuery): OrderListQuery {
  return {
    status: oneOf(scalar(raw.status), ORDER_STATUSES, "all"),
    type: oneOf(scalar(raw.type), ORDER_TYPES, "all"),
    sort: oneOf(scalar(raw.sort), ["asc", "desc"] as const, "desc"),
    page: pageNumber(scalar(raw.page)),
    // По умолчанию — рабочая очередь «Текущие» (редизайн дашборда заказов).
    mode: oneOf(scalar(raw.mode), ORDER_MODES, "current"),
    q: scalar(raw.q)?.trim().slice(0, 60) ?? "",
  };
}

export function parseBookingListQuery(raw: RawAdminQuery): BookingListQuery {
  return {
    // Режимы по макету: «Предстоящие» по умолчанию.
    mode: oneOf(scalar(raw.mode), BOOKING_MODES, "upcoming"),
    sort: oneOf(scalar(raw.sort), ["asc", "desc"] as const, "desc"),
    page: pageNumber(scalar(raw.page)),
    q: scalar(raw.q)?.trim().slice(0, 60) ?? "",
  };
}

export function pageWindow(total: number, requestedPage: number) {
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const page = Math.max(1, Math.min(requestedPage, pageCount));
  return { page, pageCount, skip: (page - 1) * ADMIN_PAGE_SIZE };
}

type OrderGroup = { status: string; type: string; _count: { _all: number } };
type BookingGroup = { status: string; _count: { _all: number } };

export function orderListCounts(groups: readonly OrderGroup[], type: OrderTypeFilter, status: OrderStatusFilter) {
  const count = (predicate: (group: OrderGroup) => boolean) => groups.reduce((sum, group) => sum + (predicate(group) ? group._count._all : 0), 0);
  const byStatus = Object.fromEntries(ORDER_STATUSES.map((key) => [key, count((group) => (type === "all" || group.type === type) && (key === "all" || group.status === key))])) as Record<OrderStatusFilter, number>;
  const byType = Object.fromEntries(ORDER_TYPES.map((key) => [key, count((group) => (status === "all" || group.status === status) && (key === "all" || group.type === key))])) as Record<OrderTypeFilter, number>;
  const byMode = Object.fromEntries(ORDER_MODES.map((key) => [key, key === "all" ? byStatus.all : count((group) => (type === "all" || group.type === type) && ORDER_MODE_STATUSES[key as Exclude<OrderModeFilter, "all">].includes(group.status))])) as Record<OrderModeFilter, number>;
  return { byStatus, byType, byMode, total: byStatus[status] };
}

export function bookingListCounts(groups: readonly BookingGroup[]) {
  const byStatus = Object.fromEntries((["new", "confirmed", "rejected", "cancelled"] as const).map((key) => [key, groups.reduce((sum, group) => sum + (group.status === key ? group._count._all : 0), 0)]));
  return byStatus;
}

export function adminListHref(base: "/admin" | "/admin/bookings", query: OrderListQuery | BookingListQuery): string {
  const params = new URLSearchParams();
  if ("status" in query && query.status !== "all") params.set("status", query.status);
  if ("type" in query && query.type !== "all") params.set("type", query.type);
  // «Текущие»/«Предстоящие» — режимы по умолчанию: в ссылке не дублируем.
  if ("mode" in query && query.mode !== "all" && query.mode !== "current" && query.mode !== "upcoming") params.set("mode", query.mode);
  if ("q" in query && query.q) params.set("q", query.q);
  if (query.sort !== "desc") params.set("sort", query.sort);
  if (query.page > 1) params.set("page", String(query.page));
  const search = params.toString();
  return search ? `${base}?${search}` : base;
}
