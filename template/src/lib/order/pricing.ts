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

export interface ZoneTariff {
  from: number; // сумма заказа, начиная с которой действует цена
  price: number;
}

export interface DeliveryZone {
  name: string;
  enabled?: boolean; // false — зона выключена (не участвует в выборе и матчинге)
  // Новый формат условий: уровни «заказ от X ₽ → доставка Y ₽»
  tariffs?: ZoneTariff[];
  // Legacy-поля: мигрируют в tariffs (price → уровень от 0, freeFrom → уровень с ценой 0)
  price?: number;
  freeFrom?: number | null;
  deliveryMinutes?: number | null; // опциональное время доставки для показа гостю
  polygon?: [number, number][]; // геометрия зоны (зоны на карте); в расчёте не участвует
}

/** Условия зоны в виде тарифов: новые tariffs или миграция из price/freeFrom */
export function zoneTariffs(zone: DeliveryZone): ZoneTariff[] {
  if (zone.tariffs && zone.tariffs.length > 0) {
    return [...zone.tariffs].sort((a, b) => a.from - b.from);
  }
  const tariffs: ZoneTariff[] = [{ from: 0, price: zone.price ?? 0 }];
  if (zone.freeFrom != null && zone.freeFrom > 0) {
    tariffs.push({ from: zone.freeFrom, price: 0 });
  }
  return tariffs.sort((a, b) => a.from - b.from);
}

/** Цена доставки по тарифам: цена последнего уровня с from ≤ суммы заказа */
export function tariffPrice(tariffs: ZoneTariff[], itemsTotal: number): number {
  let price = tariffs[0]?.price ?? 0;
  for (const tariff of tariffs) {
    if (itemsTotal < tariff.from) break;
    price = tariff.price;
  }
  return price;
}

const rub = (n: number) => `${n.toLocaleString("ru-RU")} ₽`;

/** Сводка условий для списка зон и витрины: строка на уровень тарифа */
export function tariffLines(zone: DeliveryZone): string[] {
  const tariffs = zoneTariffs(zone);
  if (tariffs.length === 1) {
    return [tariffs[0].price === 0 ? "Доставка бесплатно" : `Доставка ${rub(tariffs[0].price)}`];
  }
  const lines: string[] = [];
  tariffs.forEach((tariff, i) => {
    const label = tariff.price === 0 ? "бесплатно" : rub(tariff.price);
    if (i === 0 && tariff.from === 0) lines.push(`Доставка ${label}`);
    else lines.push(`от ${rub(tariff.from)} — ${label}`);
  });
  return lines;
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
  if (zone.enabled === false) throw new Error(`Зона доставки недоступна: ${zoneName}`);
  return tariffPrice(zoneTariffs(zone), itemsTotal);
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
