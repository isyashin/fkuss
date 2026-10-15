export const ORDER_STATUS_CHAINS = {
  // Упрощённый поток (по владельцу): две кнопки — «Принять заказ» и «Заказ готов».
  delivery: ["new", "accepted", "ready"],
  pickup: ["new", "accepted", "ready"],
} as const;

// Заказы, созданные до упрощения: промежуточные статусы доводим до финала теми же кнопками.
const LEGACY_NEXT: Record<string, OrderStatus> = {
  cooking: "ready",
  handed_to_courier: "delivered",
};

export const ORDER_STATUS_CODES = ["new", "accepted", "cooking", "ready", "handed_to_courier", "delivered", "issued", "cancelled"] as const;
export type OrderStatus = typeof ORDER_STATUS_CODES[number];
export type OrderType = keyof typeof ORDER_STATUS_CHAINS;

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  new: "Новый",
  accepted: "Принят",
  cooking: "Готовится",
  ready: "Готов",
  handed_to_courier: "Передан курьеру",
  delivered: "Доставлен",
  issued: "Выдан",
  cancelled: "Отменён",
};

const ACTION_LABELS: Record<Exclude<OrderStatus, "new">, string> = {
  accepted: "Принять заказ",
  cooking: "Готовится",
  ready: "Заказ готов",
  handed_to_courier: "Передан курьеру",
  delivered: "Доставлен",
  issued: "Выдан",
  cancelled: "Отменить",
};

export function isOrderType(type: string): type is OrderType {
  return type === "delivery" || type === "pickup";
}

export function isOrderStatus(status: string): status is OrderStatus {
  return (ORDER_STATUS_CODES as readonly string[]).includes(status);
}

export function orderStatusLabel(status: string): string {
  return isOrderStatus(status) ? ORDER_STATUS_LABELS[status] : status;
}

export function nextOrderStatus(type: string, status: string): OrderStatus | null {
  if (!isOrderType(type)) return null;
  const legacy = LEGACY_NEXT[status];
  if (legacy) return legacy;
  const chain: readonly string[] = ORDER_STATUS_CHAINS[type];
  const index = chain.indexOf(status);
  return index >= 0 && index < chain.length - 1 ? chain[index + 1] as OrderStatus : null;
}

export function isFinalOrderStatus(type: string, status: string): boolean {
  if (!isOrderType(type)) return false;
  if (status === "ready") return true;
  // Финалы старой цепочки (заказы, созданные до упрощения)
  return type === "delivery" ? status === "delivered" : status === "issued";
}

export function canTransitionOrder(type: string, from: string, to: string): boolean {
  if (to === "cancelled") return isOrderType(type) && isOrderStatus(from) && from !== "cancelled" && !isFinalOrderStatus(type, from);
  return nextOrderStatus(type, from) === to;
}

export function orderActionsFor(type: string, status: string): { status: OrderStatus; label: string }[] {
  const next = nextOrderStatus(type, status);
  const actions: { status: OrderStatus; label: string }[] = [];
  if (next) actions.push({ status: next, label: ACTION_LABELS[next as Exclude<OrderStatus, "new">] });
  if (canTransitionOrder(type, status, "cancelled")) actions.push({ status: "cancelled", label: ACTION_LABELS.cancelled });
  return actions;
}

export function statusAfterSuccessfulPayment(status: string): string {
  return status === "new" ? "accepted" : status;
}
