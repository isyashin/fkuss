const deliveryStatuses = ["Новый", "Принят", "Готовится", "Готов", "Передан курьеру", "Доставлен", "Отменён"];
const pickupStatuses = ["Новый", "Принят", "Готовится", "Готов", "Выдан", "Отменён"];

export function orderStatusesFor(type) {
  if (type === "Доставка") return deliveryStatuses;
  if (type === "Самовывоз") return pickupStatuses;
  throw new Error(`Неизвестный тип заказа: ${type}`);
}

export function changeOrderStatus(orders, orderId, status) {
  return orders.map(order => {
    if (order.id !== orderId) return order;
    if (!orderStatusesFor(order.type).includes(status)) throw new Error(`Недопустимый статус для ${order.type}: ${status}`);
    return { ...order, status };
  });
}
