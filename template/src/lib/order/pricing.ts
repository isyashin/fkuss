/**
 * Расчёт заказа. Чистые функции, вся логика денег — здесь и только здесь.
 * Клиентской сумме не доверяем: на входе id блюд и модификаторы,
 * цены подставляются из БД на сервере.
 */

export interface OrderItemInput {
  dishId: string;
  price: number; // цена из БД
  quantity: number;
  modifierPrices: number[]; // цены выбранных модификаторов из БД
}

export interface DeliveryZone {
  name: string;
  price: number;
  freeFrom: number | null;
}

export function calculateItemsTotal(items: OrderItemInput[]): number {
  return items.reduce((sum, item) => {
    const modifiers = item.modifierPrices.reduce((m, p) => m + p, 0);
    return sum + (item.price + modifiers) * item.quantity;
  }, 0);
}

export function calculateDeliveryPrice(
  type: "delivery" | "pickup",
  itemsTotal: number,
  zones: DeliveryZone[],
  zoneName: string | null,
): number {
  if (type === "pickup") return 0;
  const zone = zones.find((z) => z.name === zoneName);
  if (!zone) throw new Error(`Неизвестная зона доставки: ${zoneName}`);
  if (zone.freeFrom !== null && itemsTotal >= zone.freeFrom) return 0;
  return zone.price;
}

export function checkMinOrder(
  itemsTotal: number,
  minOrder: number,
): { ok: boolean; reason?: string } {
  if (itemsTotal < minOrder) {
    return { ok: false, reason: `Минимальная сумма заказа ${minOrder} ₽` };
  }
  return { ok: true };
}

export function calculateMaxBonusSpend(
  itemsTotal: number,
  maxSpendPercent: number,
  bonusBalance: number = Number.POSITIVE_INFINITY,
): number {
  const byPercent = Math.floor((itemsTotal * maxSpendPercent) / 100);
  return Math.max(0, Math.min(byPercent, bonusBalance));
}

/** Кэшбэк начисляется с суммы, оплаченной деньгами (без бонусной части) */
export function calculateBonusAccrual(
  total: number,
  cashbackPercent: number,
  bonusSpent: number = 0,
): number {
  const base = Math.max(0, total - bonusSpent);
  return Math.floor((base * cashbackPercent) / 100);
}

/** Сумма к оплате: итог заказа с учётом варианта доставки и списанных бонусов */
export function paymentAmountForOrder(input: {
  itemsTotal: number;
  deliveryPrice: number;
  bonusSpent: number;
}): number {
  return Math.max(0, input.itemsTotal + input.deliveryPrice - input.bonusSpent);
}

export interface CalculateOrderInput {
  items: OrderItemInput[];
  type: "delivery" | "pickup";
  zoneName: string | null;
  zones: DeliveryZone[];
  minOrder: number;
  requestedBonusSpend: number;
  bonusBalance: number;
  maxSpendPercent: number;
  cashbackPercent: number;
}

export type CalculateOrderResult =
  | {
      ok: true;
      itemsTotal: number;
      deliveryPrice: number;
      bonusSpent: number;
      total: number;
      bonusAccrued: number;
    }
  | { ok: false; reason: string };

export function calculateOrder(input: CalculateOrderInput): CalculateOrderResult {
  const itemsTotal = calculateItemsTotal(input.items);

  const minCheck = checkMinOrder(itemsTotal, input.minOrder);
  if (!minCheck.ok) return { ok: false, reason: minCheck.reason! };

  let deliveryPrice: number;
  try {
    deliveryPrice = calculateDeliveryPrice(input.type, itemsTotal, input.zones, input.zoneName);
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Ошибка зоны" };
  }

  const bonusSpent =
    input.requestedBonusSpend > 0
      ? Math.min(
          input.requestedBonusSpend,
          calculateMaxBonusSpend(itemsTotal, input.maxSpendPercent, input.bonusBalance),
        )
      : 0;

  const total = itemsTotal + deliveryPrice - bonusSpent;
  // base для кэшбэка — сумма до списания бонусов; функция сама вычтет бонусную часть
  const bonusAccrued = calculateBonusAccrual(itemsTotal + deliveryPrice, input.cashbackPercent, bonusSpent);

  return { ok: true, itemsTotal, deliveryPrice, bonusSpent, total, bonusAccrued };
}
