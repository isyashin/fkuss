import { isFinalOrderStatus } from "@/lib/order-status";

/** Public summary only: no guest contacts, address, access token or payment URL. */
export interface GuestOrderSummary {
  id: string;
  number: number;
  type: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  total: number;
  createdAt: string;
  updatedAt: string;
  requestKey: string | null;
}
export interface GuestOrderDetail extends GuestOrderSummary {
  itemsTotal: number;
  deliveryPrice: number;
  bonusSpent: number;
  addressText: string;
  comment: string;
  desiredTime: string;
  confirmationUrl: string | null;
  items: { id: string; name: string; menuName: string; quantity: number; total: number; modifiers: unknown }[];
}
export function isGuestOrderFinished(order: Pick<GuestOrderSummary, "type" | "status">): boolean {
  return order.status === "cancelled" || isFinalOrderStatus(order.type, order.status);
}
export function guestOrderLabel(order: Pick<GuestOrderSummary, "type" | "status" | "paymentMethod" | "paymentStatus">): string {
  if (order.status === "cancelled") return "Отменён";
  if (order.status === "delivered") return "Доставлен";
  if (order.status === "issued") return "Выдан";
  if (order.paymentMethod === "online" && order.paymentStatus === "pending") return "Ожидает оплаты";
  if (order.paymentStatus === "failed") return "Оплата не прошла";
  if (order.status === "new") return "Ждёт подтверждения";
  if (order.status === "ready") return order.type === "pickup" ? "Можно забирать" : "Готов к доставке";
  if (order.status === "handed_to_courier") return "Курьер в пути";
  if (order.status === "cooking") return "Готовится";
  return "Принят";
}
export function reconcileGuestOrders(previous: GuestOrderSummary[], incoming: GuestOrderSummary[], acknowledged: Record<string, string>): GuestOrderSummary[] {
  const orders = new Map(previous.map(order => [order.id, order]));
  for (const order of incoming) {
    const existing = orders.get(order.id);
    if (!existing || order.updatedAt >= existing.updatedAt) orders.set(order.id, order);
  }
  return [...orders.values()].filter(order => !(isGuestOrderFinished(order) && acknowledged[order.id] === order.updatedAt))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
