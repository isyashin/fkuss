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
    include: { modifiers: true },
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
    const modifiers = item.modifierIds
      .map((mid) => dish.modifiers.find((m) => m.id === mid))
      .filter((m): m is NonNullable<typeof m> => Boolean(m));
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

  const calc = calculateOrder({
    items: pricedItems,
    type: input.type,
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

  const order = await prisma.order.create({
    data: {
      customerId,
      type: input.type,
      status: "new",
      itemsTotal: calc.itemsTotal,
      deliveryPrice: calc.deliveryPrice,
      bonusSpent: calc.bonusSpent,
      bonusAccrued: calc.bonusAccrued,
      total: calc.total,
      paymentMethod: input.paymentMethod,
      paymentStatus: input.paymentMethod === "online" ? "pending" : "none",
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      addressText: input.address,
      comment: input.comment,
      desiredTime: input.desiredTime,
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

  // Бонусы списываем сразу (ledger), начисление — при статусе «выполнен» (этап 6)
  if (customerId && calc.bonusSpent > 0) {
    await prisma.bonusTransaction.create({
      data: {
        customerId,
        orderId: order.id,
        type: "spend",
        amount: -calc.bonusSpent,
        comment: `Списание по заказу №${order.number}`,
      },
    });
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
    try {
      const payment = await provider.createPayment({
        orderId: order.id,
        orderNumber: order.number,
        amount: calc.total,
        description: `Заказ №${order.number}`,
        returnUrl: `${baseUrl}/order/${order.number}`,
      });
      confirmationUrl = payment.confirmationUrl;
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentId: payment.paymentId },
      });
    } catch {
      // Провайдер недоступен: заказ не оставляем «висеть» — помечаем и сообщаем
      await prisma.order.update({
        where: { id: order.id },
        data: { paymentStatus: "failed", comment: `${order.comment} [оплата не создана]` },
      });
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
    total: calc.total,
    itemsTotal: calc.itemsTotal,
    deliveryPrice: calc.deliveryPrice,
    bonusSpent: calc.bonusSpent,
    confirmationUrl,
  });
}
