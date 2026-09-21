import { NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { calculateOrder, type OrderItemInput } from "@/lib/order/pricing";
import { getSiteSettings } from "@/lib/site";
import { getPaymentProvider } from "@/lib/payments";

const orderSchema = z.object({
  items: z
    .array(
      z.object({
        dishId: z.string().min(1),
        quantity: z.number().int().min(1).max(99),
        modifierIds: z.array(z.string()).default([]),
      }),
    )
    .min(1)
    .max(100),
  type: z.enum(["delivery", "pickup"]),
  zoneName: z.string().nullable().default(null),
  address: z.string().max(300).default(""),
  customerName: z.string().min(1).max(100),
  customerPhone: z.string().min(5).max(20),
  customerEmail: z.email().optional().or(z.literal("")),
  comment: z.string().max(500).default(""),
  desiredTime: z.string().max(50).default(""),
  bonusSpend: z.number().int().min(0).default(0),
  paymentMethod: z.enum(["cash", "online"]).default("cash"),
  deliveryMode: z.enum(["asap", "scheduled"]).default("asap"),
  deliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  deliverySlotStart: z.string().regex(/^\d{2}:\d{2}$/).nullable().default(null),
  deliverySlotEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable().default(null),
  deliveryOptionId: z.string().nullable().default(null),
  // honeypot: у людей пустое
  website: z.string().max(0).optional(),
});

function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function POST(request: Request) {
  const ip = getClientIp(request);

  // Антибот: rate limit по IP (5 заказов за 10 минут)
  if (!rateLimit(`order:${ip}`, 5, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Слишком много заказов. Подождите несколько минут." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const parsed = orderSchema.safeParse(body);
  if (!parsed.success) {
    // honeypot срабатывает здесь же: website непустой не пройдёт zod
    return NextResponse.json({ error: "Проверьте поля заказа" }, { status: 400 });
  }
  const input = parsed.data;

  const prisma = getPrisma();
  const settings = await getSiteSettings();

  // Цены — только из БД
  const dishIds = input.items.map((i) => i.dishId);
  const dishes = await prisma.dish.findMany({
    where: { id: { in: dishIds }, available: true },
    include: { modifiers: true, modifierGroups: { include: { modifiers: true } } },
  });
  const dishMap = new Map(dishes.map((d) => [d.id, d]));

  const pricedItems: OrderItemInput[] = [];
  const orderLines: {
    dishId: string;
    name: string;
    price: number;
    quantity: number;
    modifiers: { id: string; name: string; price: number }[];
    total: number;
  }[] = [];

  for (const item of input.items) {
    const dish = dishMap.get(item.dishId);
    if (!dish) {
      return NextResponse.json({ error: `Блюдо недоступно: ${item.dishId}` }, { status: 400 });
    }

    // Выбранные модификаторы — только принадлежащие блюду
    const modifiers = item.modifierIds
      .map((mid) => dish.modifiers.find((m) => m.id === mid))
      .filter((m): m is NonNullable<typeof m> => Boolean(m));
    if (modifiers.length !== item.modifierIds.length) {
      return NextResponse.json({ error: `В «${dish.name}» выбрана недопустимая добавка` }, { status: 400 });
    }

    // min/max по группам
    if (dish.modifierGroups.length > 0) {
      const { validateModifierSelection } = await import("@/lib/order/modifier-validation");
      const result = validateModifierSelection(
        dish.modifierGroups.map((g) => ({
          id: g.id,
          name: g.name,
          minSelected: g.minSelected,
          maxSelected: g.maxSelected,
          modifierIds: g.modifiers.map((m) => m.id),
        })),
        modifiers.filter((m) => m.groupId !== null).map((m) => m.id),
      );
      if (!result.ok) {
        return NextResponse.json({ error: `«${dish.name}»: ${result.error}` }, { status: 400 });
      }
    }

    const unitPrice = dish.price + modifiers.reduce((s, m) => s + m.price, 0);
    pricedItems.push({
      dishId: dish.id,
      price: dish.price,
      quantity: item.quantity,
      modifierPrices: modifiers.map((m) => m.price),
    });
    orderLines.push({
      dishId: dish.id,
      name: dish.name,
      price: dish.price,
      quantity: item.quantity,
      modifiers: modifiers.map((m) => ({ id: m.id, name: m.name, price: m.price })),
      total: unitPrice * item.quantity,
    });
  }

  // Бонусы и привязка заказа — ТОЛЬКО из серверной сессии (не из тела запроса).
  // Email из тела — контактный, для привязки заказа к кабинету нужен вход.
  let bonusBalance = 0;
  let customerId: string | null = null;
  try {
    const { getSessionCustomer } = await import("@/lib/auth");
    const sessionCustomer = await getSessionCustomer();
    if (sessionCustomer) {
      customerId = sessionCustomer.id;
      const agg = await prisma.bonusTransaction.aggregate({
        where: { customerId: sessionCustomer.id },
        _sum: { amount: true },
      });
      bonusBalance = agg._sum.amount ?? 0;
    }
  } catch {
    // нет сессии — анонимный заказ без бонусов
  }

  // Варианты доставки с интервалами: если есть включённые — цена и время от них,
  // зоны не применяются (единое начисление, без двойной платы)
  const options =
    input.type === "delivery"
      ? await prisma.deliveryOption.findMany({ where: { enabled: true }, orderBy: { position: "asc" } })
      : [];
  const option = options.length > 0 ? (options.find((o) => o.id === input.deliveryOptionId) ?? options[0]) : null;
  const tz = (settings as { timezone?: string }).timezone ?? "Europe/Moscow";
  const now = new Date();
  let desiredTimeText = input.desiredTime;

  if (option) {
    if (option.mode === "asap") {
      desiredTimeText = "как можно скорее";
    } else {
      // scheduled: окно обязательно и валидируется сервером
      if (!input.deliveryDate || !input.deliverySlotStart || !input.deliverySlotEnd) {
        return NextResponse.json({ error: "Выберите дату и интервал доставки" }, { status: 400 });
      }
      const { isValidWindow } = await import("@/lib/delivery/slots");
      const valid = isValidWindow(
        option as unknown as import("@/lib/delivery/slots").DeliveryOptionRule,
        input.deliveryDate,
        input.deliverySlotStart,
        input.deliverySlotEnd,
        now,
        tz,
      );
      if (!valid) {
        return NextResponse.json({ error: "Выбранный интервал доставки недоступен" }, { status: 400 });
      }
      desiredTimeText = `${input.deliveryDate} ${input.deliverySlotStart}–${input.deliverySlotEnd}`;
    }
  }

  const calc = calculateOrder({
    items: pricedItems,
    // При наличии варианта зоны не участвуют: считаем позиции как pickup
    type: option ? "pickup" : input.type,
    zoneName: input.zoneName,
    zones: settings.delivery.zones,
    minOrder: input.type === "delivery" ? settings.delivery.minOrder : 0,
    requestedBonusSpend: customerId ? input.bonusSpend : 0,
    bonusBalance,
    maxSpendPercent: settings.loyalty.maxSpendPercent,
    cashbackPercent: settings.loyalty.cashbackPercent,
  });
  if (!calc.ok) {
    return NextResponse.json({ error: calc.reason }, { status: 400 });
  }

  let deliveryPriceFinal = calc.deliveryPrice;
  let deliveryOptionName: string | null = null;
  if (option) {
    const { deliveryPrice } = await import("@/lib/delivery/slots");
    deliveryPriceFinal = deliveryPrice(
      option as unknown as import("@/lib/delivery/slots").DeliveryOptionRule,
      calc.itemsTotal,
    );
    deliveryOptionName = option.name;
  }
  const totalFinal = calc.total - calc.deliveryPrice + deliveryPriceFinal;
  const bonusAccruedFinal =
    deliveryPriceFinal !== calc.deliveryPrice
      ? (await import("@/lib/order/pricing")).calculateBonusAccrual(
          calc.itemsTotal + deliveryPriceFinal,
          settings.loyalty.cashbackPercent,
          calc.bonusSpent,
        )
      : calc.bonusAccrued;

  // Атомарно: создание заказа + списание бонусов одной транзакцией,
  // с повторной проверкой баланса внутри (защита от конкурентного списания)
  let order;
  try {
    order = await prisma.$transaction(async (tx) => {
      if (customerId && calc.bonusSpent > 0) {
        const agg = await tx.bonusTransaction.aggregate({
          where: { customerId },
          _sum: { amount: true },
        });
        const balanceNow = agg._sum.amount ?? 0;
        if (balanceNow < calc.bonusSpent) {
          throw new Error("BONUS_BALANCE_RACE");
        }
      }

      const created = await tx.order.create({
        data: {
          customerId,
          type: input.type,
          status: "new",
          itemsTotal: calc.itemsTotal,
          deliveryPrice: deliveryPriceFinal,
          bonusSpent: calc.bonusSpent,
          bonusAccrued: bonusAccruedFinal,
          total: totalFinal,
          paymentMethod: input.paymentMethod,
          paymentStatus: input.paymentMethod === "online" ? "pending" : "none",
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          addressText: input.address,
          comment: input.comment,
          desiredTime: desiredTimeText,
          deliveryMode: input.type === "delivery" ? input.deliveryMode : null,
          deliveryDate: input.type === "delivery" ? input.deliveryDate : null,
          deliverySlotStart: input.type === "delivery" ? input.deliverySlotStart : null,
          deliverySlotEnd: input.type === "delivery" ? input.deliverySlotEnd : null,
          deliveryTz: input.type === "delivery" ? ((settings as { timezone?: string }).timezone ?? "Europe/Moscow") : null,
          deliveryOptionName,
          items: {
            create: orderLines.map((l) => ({
              dishId: l.dishId,
              name: l.name,
              price: l.price,
              quantity: l.quantity,
              modifiers: l.modifiers,
              total: l.total,
            })),
          },
        },
        include: { items: true },
      });

      if (customerId && calc.bonusSpent > 0) {
        await tx.bonusTransaction.create({
          data: {
            customerId,
            orderId: created.id,
            type: "spend",
            amount: -calc.bonusSpent,
            comment: `Списание по заказу №${created.number}`,
          },
        });
      }

      return created;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "BONUS_BALANCE_RACE") {
      return NextResponse.json(
        { error: "Недостаточно бонусов — обновите страницу и попробуйте снова" },
        { status: 409 },
      );
    }
    throw error;
  }

  // Онлайн-оплата: создаём платёж у провайдера
  let confirmationUrl: string | null = null;
  if (input.paymentMethod === "online") {
    const provider = getPaymentProvider(settings.payment.provider);
    if (!provider) {
      return NextResponse.json({ error: "Онлайн-оплата не настроена" }, { status: 400 });
    }
    const canonical = settings.domains.canonical;
    const baseUrl = canonical.startsWith("http") ? canonical : `https://${canonical}`;
    const { paymentAmountForOrder } = await import("@/lib/order/pricing");
    const amount = paymentAmountForOrder({
      itemsTotal: calc.itemsTotal,
      deliveryPrice: deliveryPriceFinal,
      bonusSpent: calc.bonusSpent,
    });
    try {
      const payment = await provider.createPayment({
        orderId: order.id,
        orderNumber: order.number,
        amount,
        description: `Заказ №${order.number}`,
        returnUrl: `${baseUrl}/order/success?n=${order.number}`,
      });
      confirmationUrl = payment.confirmationUrl;
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentId: payment.paymentId },
      });
    } catch {
      // Компенсация: провайдер недоступен — возвращаем списанные бонусы,
      // заказ помечаем failed, клиент может выбрать оплату при получении
      await prisma.$transaction([
        ...(customerId && calc.bonusSpent > 0
          ? [
              prisma.bonusTransaction.create({
                data: {
                  customerId,
                  orderId: order.id,
                  type: "refund",
                  amount: calc.bonusSpent,
                  comment: `Возврат бонусов, платёж не создан (заказ №${order.number})`,
                },
              }),
            ]
          : []),
        prisma.order.update({
          where: { id: order.id },
          data: { paymentStatus: "failed", comment: `${order.comment} [оплата не создана]` },
        }),
      ]);
      return NextResponse.json(
        { error: "Не удалось создать платёж. Выберите оплату при получении или попробуйте позже." },
        { status: 502 },
      );
    }
  }

  // Уведомления в каналы. Для онлайн-оплаты — после webhook «оплачено».
  if (input.paymentMethod !== "online") {
    try {
      const { notifyNewOrder } = await import("@/lib/notify");
      await notifyNewOrder(order.id);
    } catch {
      // уведомления не должны ронять заказ
    }
  }

  // Мгновенный репорт метрик на платформу (fire-and-forget, заказ не ждёт)
  try {
    const { runMetricsReport } = await import("@/lib/metrics-report");
    void runMetricsReport().catch(() => {});
  } catch {
    // метрики не должны ронять заказ
  }

  return NextResponse.json({
    ok: true,
    orderNumber: order.number,
    total: totalFinal,
    itemsTotal: calc.itemsTotal,
    deliveryPrice: deliveryPriceFinal,
    bonusSpent: calc.bonusSpent,
    confirmationUrl,
  });
}
