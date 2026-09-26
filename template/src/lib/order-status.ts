export const ORDER_STATUS_CHAINS = {
  delivery: ["new", "accepted", "cooking", "ready", "handed_to_courier", "delivered"],
  pickup: ["new", "accepted", "cooking", "ready", "issued"],
} as const;

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
  accepted: "Принять",
  cooking: "Готовится",
  ready: "Готов",
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
  const chain: readonly string[] = ORDER_STATUS_CHAINS[type];
  const index = chain.indexOf(status);
  return index >= 0 && index < chain.length - 1 ? chain[index + 1] as OrderStatus : null;
}

export function isFinalOrderStatus(type: string, status: string): boolean {
  return isOrderType(type) && ORDER_STATUS_CHAINS[type].at(-1) === status;
}

export function canTransitionOrder(type: string, from: string, to: string): boolean {
  if (to === "cancelled") return isOrderType(type) && from !== "cancelled" && !isFinalOrderStatus(type, from) && (ORDER_STATUS_CHAINS[type] as readonly string[]).includes(from);
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
