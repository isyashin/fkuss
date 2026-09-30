export function orderEditBlockReason(order: {
  status: string; paymentMethod: string; paymentStatus: string; paymentId: string | null;
}): string | null {
  if (!["new", "accepted", "cooking", "ready", "handed_to_courier"].includes(order.status)) return "Редактирование завершённого или отменённого заказа недоступно";
  if (order.paymentMethod !== "cash" || order.paymentStatus !== "none" || order.paymentId) {
    return "Редактирование заказа с онлайн-оплатой или платежом недоступно";
  }
  return null;
}
