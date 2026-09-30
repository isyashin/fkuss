import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { settingsSchema } from "@/lib/content-schema";
import { calculateOrder, calculateBonusAccrual } from "@/lib/order/pricing";
import { deliveryPrice as optionDeliveryPrice, type DeliveryOptionRule } from "@/lib/delivery/slots";
import { validateModifierSelection } from "@/lib/order/modifier-validation";
import { orderEditBlockReason } from "@/lib/order-edit-policy";

const lineSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("existing"), itemId: z.string().min(1), quantity: z.number().int().min(1).max(99) }),
  z.object({ kind: z.literal("new"), dishId: z.string().min(1), modifierIds: z.array(z.string().min(1)).max(30), quantity: z.number().int().min(1).max(99) }),
]);

export const orderEditSchema = z.object({
  orderId: z.string().min(1).max(128),
  expectedUpdatedAt: z.iso.datetime({ offset: true }),
  lines: z.array(lineSchema).min(1).max(100),
  deliveryChoice: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("zone"), name: z.string().min(1) }),
    z.object({ kind: z.literal("option"), id: z.string().min(1) }),
  ]).nullable(),
});

export type OrderEditInput = z.infer<typeof orderEditSchema>;

function snapshotModifierPrices(value: unknown): number[] {
  if (!Array.isArray(value)) throw new Error("Повреждён снимок добавок в заказе");
  return value.map((modifier) => {
    if (!modifier || typeof modifier !== "object" || !Number.isSafeInteger(modifier.price) || modifier.price < 0) {
      throw new Error("Повреждён снимок добавок в заказе");
    }
    return modifier.price as number;
  });
}

export async function editOrderItems(prisma: PrismaClient, rawInput: OrderEditInput) {
  const input = orderEditSchema.parse(rawInput);
  if (new Set(input.lines.filter((line) => line.kind === "existing").map((line) => line.itemId)).size !==
      input.lines.filter((line) => line.kind === "existing").length) {
    throw new Error("Одна позиция указана дважды");
  }

  return prisma.$transaction(async (tx) => {
    // Статус, сумма и состав другого оператора должны быть видны только после
    // получения блокировки строки заказа.
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${input.orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id: input.orderId }, include: { items: true } });
    if (!order) throw new Error("Заказ не найден");
    const blocked = orderEditBlockReason(order);
    if (blocked) throw new Error(blocked);
    if (order.updatedAt.toISOString() !== input.expectedUpdatedAt) {
      throw new Error("Заказ изменён другим оператором. Обновите страницу.");
    }

    const settingsRow = await tx.settings.findUnique({ where: { key: "settings" } });
    if (!settingsRow) throw new Error("Настройки сайта не найдены");
    const settings = settingsSchema.parse(settingsRow.value);
    const oldItems = new Map(order.items.map((item) => [item.id, item]));
    const newDishIds = input.lines.filter((line) => line.kind === "new").map((line) => line.dishId);
    const dishes = await tx.dish.findMany({
      where: { id: { in: newDishIds }, available: true },
      include: { modifiers: true, modifierGroups: { include: { modifiers: true } } },
    });
    const dishMap = new Map(dishes.map((dish) => [dish.id, dish]));
    const pricedItems: { dishId: string; price: number; quantity: number; modifierPrices: number[] }[] = [];
    const kept: { id: string; quantity: number; total: number }[] = [];
    const added: { dishId: string; name: string; price: number; quantity: number; modifiers: { id: string; name: string; price: number }[]; total: number }[] = [];

    for (const line of input.lines) {
      if (line.kind === "existing") {
        const item = oldItems.get(line.itemId);
        if (!item) throw new Error("Позиция заказа не найдена. Обновите страницу.");
        const modifierPrices = snapshotModifierPrices(item.modifiers);
        const unit = item.price + modifierPrices.reduce((sum, price) => sum + price, 0);
        const total = unit * line.quantity;
        pricedItems.push({ dishId: item.dishId, price: item.price, quantity: line.quantity, modifierPrices });
        kept.push({ id: item.id, quantity: line.quantity, total });
      } else {
        const dish = dishMap.get(line.dishId);
        if (!dish) throw new Error("Блюдо недоступно в каталоге");
        if (new Set(line.modifierIds).size !== line.modifierIds.length) throw new Error("Добавка выбрана дважды");
        const modifiers = line.modifierIds.map((id) => dish.modifiers.find((modifier) => modifier.id === id));
        if (modifiers.some((modifier) => !modifier)) throw new Error(`«${dish.name}»: недопустимая добавка`);
        const selected = modifiers.filter((modifier): modifier is NonNullable<typeof modifier> => Boolean(modifier));
        const valid = validateModifierSelection(
          dish.modifierGroups.map((group) => ({ id: group.id, name: group.name, minSelected: group.minSelected,
            maxSelected: group.maxSelected, modifierIds: group.modifiers.map((modifier) => modifier.id) })),
          selected.filter((modifier) => modifier.groupId !== null).map((modifier) => modifier.id),
        );
        if (!valid.ok) throw new Error(`«${dish.name}»: ${valid.error}`);
        const modifierPrices = selected.map((modifier) => modifier.price);
        const total = (dish.price + modifierPrices.reduce((sum, price) => sum + price, 0)) * line.quantity;
        pricedItems.push({ dishId: dish.id, price: dish.price, quantity: line.quantity, modifierPrices });
        added.push({ dishId: dish.id, name: dish.name, price: dish.price, quantity: line.quantity,
          modifiers: selected.map((modifier) => ({ id: modifier.id, name: modifier.name, price: modifier.price })), total });
      }
    }
    const increasedDishIds = input.lines.flatMap((line) => line.kind === "existing" &&
      line.quantity > (oldItems.get(line.itemId)?.quantity ?? 0) ? [oldItems.get(line.itemId)!.dishId] : []);
    if (increasedDishIds.length) {
      const available = await tx.dish.findMany({ where: { id: { in: increasedDishIds }, available: true }, select: { id: true } });
      if (new Set(available.map((dish) => dish.id)).size !== new Set(increasedDishIds).size) {
        throw new Error("Увеличение количества недоступного блюда запрещено");
      }
    }
    if (pricedItems.some((item) => !Number.isSafeInteger((item.price + item.modifierPrices.reduce((sum, price) => sum + price, 0)) * item.quantity))) {
      throw new Error("Сумма позиции вне допустимого диапазона");
    }

    let bonusBalance = 0;
    if (order.customerId) {
      const lockKey = `bonus:${order.customerId}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
      const [balance, thisOrder] = await Promise.all([
        tx.bonusTransaction.aggregate({ where: { customerId: order.customerId }, _sum: { amount: true } }),
        tx.bonusTransaction.aggregate({ where: { orderId: order.id, type: { in: ["spend", "refund"] } }, _sum: { amount: true } }),
      ]);
      if ((thisOrder._sum.amount ?? 0) !== -order.bonusSpent) throw new Error("Списание бонусов заказа не совпадает с историей операций");
      bonusBalance = (balance._sum.amount ?? 0) + order.bonusSpent;
    } else if (order.bonusSpent > 0) {
      throw new Error("Заказ без гостя не может содержать списанные бонусы");
    }

    let selectedOption: DeliveryOptionRule | null = null;
    let calculationType: "delivery" | "pickup" = order.type === "delivery" ? "delivery" : "pickup";
    let zoneName: string | null = null;
    if (order.type === "pickup") {
      if (input.deliveryChoice !== null) throw new Error("Для самовывоза доставка не выбирается");
    } else if (input.deliveryChoice?.kind === "zone") {
      if (order.deliveryOptionName) throw new Error("Для этого заказа нужен прежний вариант доставки");
      zoneName = input.deliveryChoice.name;
    } else if (input.deliveryChoice?.kind === "option") {
      const option = await tx.deliveryOption.findUnique({ where: { id: input.deliveryChoice.id } });
      if (!option || !option.enabled || option.name !== order.deliveryOptionName) {
        throw new Error("Вариант доставки изменился или недоступен");
      }
      if (option.mode !== "asap" && option.mode !== "scheduled") throw new Error("Некорректный режим доставки");
      calculationType = "pickup";
      selectedOption = option as DeliveryOptionRule;
    } else {
      throw new Error("Выберите действующую зону или вариант доставки");
    }

    const calc = calculateOrder({
      items: pricedItems, type: calculationType, zoneName, zones: settings.delivery.zones,
      minOrder: order.type === "delivery" ? settings.delivery.minOrder : 0,
      requestedBonusSpend: order.bonusSpent, bonusBalance,
      maxSpendPercent: settings.loyalty.maxSpendPercent, cashbackPercent: settings.loyalty.cashbackPercent,
    });
    if (!calc.ok) throw new Error(calc.reason);
    const deliveryPrice = selectedOption ? optionDeliveryPrice(selectedOption, calc.itemsTotal) : calc.deliveryPrice;
    const total = calc.itemsTotal + deliveryPrice - calc.bonusSpent;
    const bonusAccrued = calculateBonusAccrual(calc.itemsTotal + deliveryPrice, settings.loyalty.cashbackPercent, calc.bonusSpent);
    if (![calc.itemsTotal, deliveryPrice, calc.bonusSpent, total, bonusAccrued].every((value) => Number.isSafeInteger(value) && value >= 0)) {
      throw new Error("Сумма заказа вне допустимого диапазона");
    }
    const additionalSpend = calc.bonusSpent - order.bonusSpent;
    if (additionalSpend > 0 && bonusBalance - order.bonusSpent < additionalSpend) {
      throw new Error("Недостаточно бонусов. Обновите страницу.");
    }

    await tx.orderItem.deleteMany({ where: { orderId: order.id, id: { notIn: kept.map((item) => item.id) } } });
    for (const item of kept) {
      await tx.orderItem.update({ where: { id: item.id }, data: { quantity: item.quantity, total: item.total } });
    }
    if (added.length) await tx.orderItem.createMany({ data: added.map((item) => ({ ...item, orderId: order.id })) });
    if (order.customerId && additionalSpend !== 0) {
      await tx.bonusTransaction.create({ data: {
        customerId: order.customerId, orderId: order.id,
        type: additionalSpend > 0 ? "spend" : "refund", amount: -additionalSpend,
        comment: `Корректировка бонусов при изменении заказа №${order.number}`,
      } });
    }
    await tx.order.update({ where: { id: order.id }, data: {
      itemsTotal: calc.itemsTotal, deliveryPrice, bonusSpent: calc.bonusSpent, bonusAccrued, total,
      updatedAt: new Date(Math.max(Date.now(), order.updatedAt.getTime() + 1)),
    } });
    return { itemsTotal: calc.itemsTotal, deliveryPrice, bonusSpent: calc.bonusSpent, bonusAccrued, total };
  });
}
