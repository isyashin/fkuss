import { NextResponse } from "next/server";
import { attachOrderConfirmation } from "@/lib/order-confirmation";
import { z } from "zod";
import { guestOrderSummary, privateOrderJson, replayCheckout, sameOrderOrigin, trackingHash, trackingSession } from "@/lib/order/guest-order-tracking";
import { isGuestOrderFinished } from "@/lib/order/guest-order-state";
import { getPrisma } from "@/lib/db";
import { recordAdminEvent } from "@/lib/admin-events";
import { rateLimit } from "@/lib/rate-limit";
import { calculateOrder, type OrderItemInput } from "@/lib/order/pricing";
import { lockAndCheckBonusBalance } from "@/lib/order/bonus-lock";
import { isLoyaltyEnabled } from "@/lib/loyalty-settings";
import { deliveryGeoMode, GEO_ADDRESS_ERROR } from "@/lib/delivery/geo-policy";
import { geocodeAddress } from "@/lib/delivery/geocoder";
import { resolveGeoDelivery, OUTSIDE_ZONE_NAME } from "@/lib/delivery/zone-resolve";
import { getSiteRestaurant, getSiteSettings } from "@/lib/site";
import { getPaymentProvider } from "@/lib/payments";
import type { PaymentProvider } from "@/lib/payments/types";
import { guestPhoneSchema, preferredChannelInputSchema } from "@/lib/guest-contact";
import { isValidPreOrderSlot, preOrderSnapshot } from "@/lib/order/preorder";
import { isValidLocalDate, isValidLocalTime } from "@/lib/local-date";
import { isOpenAt, nowInTimeZone, resolveSchedule } from "@/lib/hours";

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
  // Структурированный адрес (город/улица/дом обязательны при их использовании).
  addressCity: z.string().max(100).default(""),
  addressStreet: z.string().max(150).default(""),
  addressHouse: z.string().max(30).default(""),
  addressEntrance: z.string().max(30).default(""),
  addressApartment: z.string().max(30).default(""),
  addressIntercom: z.string().max(60).default(""),
  customerName: z.string().min(1).max(100),
  customerPhone: guestPhoneSchema,
  preferredChannel: preferredChannelInputSchema,
  customerEmail: z.email().optional().or(z.literal("")),
  comment: z.string().max(500).default(""),
  desiredTime: z.string().max(50).default(""),
  bonusSpend: z.number().int().min(0).default(0),
  paymentMethod: z.enum(["cash", "online"]).default("cash"),
  deliveryMode: z.enum(["asap", "scheduled"]).default("asap"),
  deliveryDate: z.string().refine(isValidLocalDate).nullable().default(null),
  deliverySlotStart: z.string().refine(isValidLocalTime).nullable().default(null),
  deliverySlotEnd: z.string().refine(isValidLocalTime).nullable().default(null),
  deliveryOptionId: z.string().nullable().default(null),
  // Предзаказ ко времени (самовывоз / доставка без вариантов)
  preOrderDate: z.string().refine(isValidLocalDate).nullable().default(null),
  preOrderTime: z.string().refine(isValidLocalTime).nullable().default(null),
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


  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const parsed = orderSchema.safeParse(body);
  if (!parsed.success) {
    // honeypot срабатывает здесь же: website непустой не пройдёт zod
    const issue = parsed.error.issues[0];
    const fieldMessages: Record<string, string> = {
      items: "Корзина пуста — выберите блюда",
      customerName: "Укажите имя",
      customerPhone: "Укажите корректный телефон",
      address: "Укажите адрес доставки",
      type: "Выберите тип заказа",
    };
    const message = (issue && fieldMessages[String(issue.path[0])]) || "Проверьте поля заказа";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  const input = parsed.data;

  const prisma = getPrisma();
  const requestKey = request.headers.get("idempotency-key");
  const tracking = requestKey ? await trackingSession(request) : null;
  const requestHash = requestKey ? trackingHash(JSON.stringify(input)) : "";
  if (requestKey) {
    if (!sameOrderOrigin(request)) return privateOrderJson({ error: "Недопустимый источник запроса" }, 403);
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(requestKey) || !tracking) return privateOrderJson({ error: "Обновите страницу и отправьте заказ ещё раз" }, 409);
    // Replay before menu/price validation: a lost response remains recoverable after a price change.
    const replay = await replayCheckout(tracking.id, requestKey, requestHash);
    if (replay) return replay;
  }
  // Replays do not consume the new-order limit.
  if (!rateLimit(`order:${ip}`, 5, 10 * 60 * 1000)) return privateOrderJson({ error: "Слишком много заказов. Подождите несколько минут." },429);
  const settings = await getSiteSettings();

  // Проверяем конфигурацию онлайн-оплаты до создания заказа и списания бонусов.
  let paymentProvider: PaymentProvider | null = null;
  if (input.paymentMethod === "online") {
    try {
      paymentProvider = getPaymentProvider(settings.payment.provider);
    } catch {
      return privateOrderJson({ error: "Онлайн-оплата временно недоступна", createdOrder:false },503);
    }
    if (!paymentProvider) {
      return NextResponse.json({ error: "Онлайн-оплата не настроена" }, { status: 400 });
    }
  }

  // Цены — только из БД
  const dishIds = input.items.map((i) => i.dishId);
  const dishes = await prisma.dish.findMany({
    where: { id: { in: dishIds }, available: true },
    include: {
      modifiers: true,
      modifierGroups: { include: { modifiers: true } },
      category: { select: { menuId: true } },
    },
  });
  const dishMap = new Map(dishes.map((d) => [d.id, d]));
  // Группы меню — для снимка названия в позиции заказа
  const { resolveMenuName } = await import("@/lib/multi-menu");
  const menuGroups = await prisma.menuGroup.findMany();

  const pricedItems: OrderItemInput[] = [];
  const orderLines: {
    dishId: string;
    name: string;
    price: number;
    menuName: string;
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
      menuName: resolveMenuName(menuGroups, dish.category?.menuId),
      quantity: item.quantity,
      modifiers: modifiers.map((m) => ({ id: m.id, name: m.name, price: m.price })),
      total: unitPrice * item.quantity,
    });
  }

  // Бонусы и привязка заказа — ТОЛЬКО из серверной сессии (не из тела запроса).
  // Email из тела — контактный, для привязки заказа к кабинету нужен вход.
  let bonusBalance = 0;
  let customerId: string | null = null;
  const cabinet = (await import("@/lib/guest-cabinet")).normalizeGuestCabinet(settings);
  const loyaltyEnabled = isLoyaltyEnabled(settings) && cabinet.enabled;
  try {
    const { getSessionCustomer } = await import("@/lib/auth");
    const sessionCustomer = await getSessionCustomer();
    if (sessionCustomer && cabinet.enabled) {
      customerId = sessionCustomer.id;
      if (loyaltyEnabled) {
        const agg = await prisma.bonusTransaction.aggregate({
          where: { customerId: sessionCustomer.id },
          _sum: { amount: true },
        });
        bonusBalance = agg._sum.amount ?? 0;
      }
    }
  } catch {
    // нет сессии — анонимный заказ без бонусов
  }
  // Деньги: при выключенном кабинете списание бонусов недопустимо,
  // даже если у гостя осталась живая сессия.
  if (!loyaltyEnabled && input.bonusSpend > 0) {
    return NextResponse.json({ error: !cabinet.enabled ? "Бонусы недоступны: личный кабинет отключён" : "Бонусная программа выключена. Обновите страницу и оформите заказ без бонусов." }, { status: 400 });
  }

  // Структурированный адрес: гео-проверка идёт по «город, улица, дом»,
  // подъезд/квартира/домофон — только в сохраняемую строку.
  const structuredAddress =
    input.type === "delivery" &&
    Boolean(input.addressCity.trim() || input.addressStreet.trim() || input.addressHouse.trim());
  const geoAddress = structuredAddress
    ? `${input.addressCity.trim()}, ${input.addressStreet.trim()}, ${input.addressHouse.trim()}`
    : input.address;
  const addressExtras = structuredAddress
    ? [
        input.addressEntrance.trim() && `подъезд ${input.addressEntrance.trim()}`,
        input.addressApartment.trim() && `кв. ${input.addressApartment.trim()}`,
        input.addressIntercom.trim() && `домофон ${input.addressIntercom.trim()}`,
      ].filter(Boolean).join(", ")
    : "";
  const storedAddress = structuredAddress
    ? (addressExtras ? `${geoAddress}, ${addressExtras}` : geoAddress)
    : input.address;

  // Варианты доставки с интервалами: если есть включённые — цена и время от них,
  // зоны не применяются (единое начисление, без двойной платы)
  if (input.type === "delivery") {
    // BUG-012: флаги и адрес — серверные проверки
    if (!settings.delivery.enabled) {
      return NextResponse.json({ error: "Доставка временно недоступна" }, { status: 400 });
    }
    if (!structuredAddress && !input.address.trim()) {
      return NextResponse.json({ error: "Укажите адрес доставки" }, { status: 400 });
    }
    if (structuredAddress && (!input.addressCity.trim() || !input.addressStreet.trim() || !input.addressHouse.trim())) {
      return NextResponse.json({ error: "Заполните город, улицу и дом" }, { status: 400 });
    }
  } else if (!settings.delivery.pickupEnabled) {
    return NextResponse.json({ error: "Самовывоз временно недоступен" }, { status: 400 });
  }

  const configuredOptions =
    input.type === "delivery"
      ? await prisma.deliveryOption.findMany({ orderBy: { position: "asc" } })
      : [];

  // Если варианты настроены, клиент обязан выбрать существующий включённый
  // вариант. Нельзя подменять отсутствующий/выключенный ID первым вариантом.
  const option =
    configuredOptions.length > 0
      ? (configuredOptions.find((o) => o.id === input.deliveryOptionId && o.enabled) ?? null)
      : null;
  if (input.type === "delivery" && configuredOptions.length > 0 && !option) {
    return NextResponse.json({ error: "Выберите доступный вариант доставки" }, { status: 400 });
  }

  const tz = (settings as { timezone?: string }).timezone ?? "Europe/Moscow";
  const now = new Date();
  let desiredTimeText = input.desiredTime;
  let preOrderData: ReturnType<typeof preOrderSnapshot> | null = null;

  if (option) {
    // Снимок режима — из найденной опции, не из тела запроса
    if (option.mode !== "asap" && option.mode !== "scheduled") {
      return NextResponse.json({ error: "Некорректный режим доставки" }, { status: 400 });
    }
    const { restaurantLocal } = await import("@/lib/delivery/slots");
    const local = restaurantLocal(now, tz);

    if (option.mode === "asap") {
      const dayOk = option.days.includes(local.day) && !option.exceptions.includes(local.date);
      if (!dayOk) {
        return NextResponse.json({ error: "Доставка в выбранный день недоступна" }, { status: 400 });
      }
      // BUG-012: ASAP проверяем часы варианта
      const [fh, fm] = option.hoursFrom.split(":").map(Number);
      const [th, tm] = option.hoursTo.split(":").map(Number);
      const fromMin = fh * 60 + fm;
      const toMin = th * 60 + tm;
      if (local.minutes < fromMin || local.minutes >= toMin) {
        return NextResponse.json({ error: "Срочная доставка сейчас недоступна" }, { status: 400 });
      }
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

  // Предзаказ ко времени: применяется к самовывозу и к доставке без вариантов.
  // Слот валидируется сервером по настройкам: только разрешённые, не прошедшие.
  if (input.preOrderDate !== null || input.preOrderTime !== null) {
    const preOrderApplies = input.type === "pickup" || configuredOptions.length === 0;
    if (
      !preOrderApplies ||
      input.preOrderDate === null ||
      input.preOrderTime === null ||
      !isValidPreOrderSlot(settings.preOrder, input.preOrderDate, input.preOrderTime, now, tz)
    ) {
      return NextResponse.json({ error: "Выбранное время предзаказа недоступно" }, { status: 400 });
    }
    preOrderData = preOrderSnapshot(input.preOrderDate, input.preOrderTime, tz);
    desiredTimeText = preOrderData.desiredTime;
  }

  // ASAP требует открытого ресторана. Явно настроенные будущие слоты
  // предзаказа/доставки остаются доступны и после закрытия.
  if (!preOrderData && option?.mode !== "scheduled") {
    const restaurant = await getSiteRestaurant();
    const local = nowInTimeZone(tz, now);
    if (!isOpenAt(resolveSchedule(restaurant), local.date, local.time)) {
      return NextResponse.json({ error: "Ресторан сейчас закрыт. Выберите доступное время предзаказа." }, { status: 400 });
    }
  }

  // Зоны на карте (geo-режим): сервер сам геокодирует адрес и определяет зону.
  // Клиентским зоне/координатам не доверяем. Вариант задаёт цену и время,
  // но не отменяет проверку адреса. Недоступная конфигурация закрывает доставку.
  let orderZoneName: string | null = null;
  let snapshotZoneName: string | null = null;
  let orderZones = settings.delivery.zones;
  if (input.type === "delivery") {
    const geo = settings.delivery.geo ?? { enabled: false, outside: "block" as const, outsidePrice: 0 };
    const geoMode = deliveryGeoMode(settings.delivery);
    if (geoMode === "invalid") {
      return privateOrderJson({ error: "Доставка по карте временно недоступна. Выберите самовывоз.", createdOrder:false },503);
    }
    if (geoMode === "active") {
      const resolved = await resolveGeoDelivery({
        address: geoAddress,
        zones: settings.delivery.zones,
        outside: geo.outside,
        outsidePrice: geo.outsidePrice,
        geocode: geocodeAddress,
      });
      if (resolved.kind === "outside-blocked") {
        return NextResponse.json({ error: "Адрес вне зоны доставки" }, { status: 400 });
      }
      if (resolved.kind === "address-imprecise") {
        return NextResponse.json({ error: GEO_ADDRESS_ERROR }, { status: 400 });
      }
      if (resolved.kind === "address-not-found") {
        return NextResponse.json({ error: "Адрес не найден — проверьте написание" }, { status: 400 });
      }
      if (resolved.kind === "geocoder-error") {
        return NextResponse.json(
          { error: "Не удалось проверить адрес. Попробуйте ещё раз.", createdOrder:false },
          { status: 503 },
        );
      }
      snapshotZoneName = resolved.kind === "zone" ? resolved.zoneName : "Вне зон";
      if (!option) {
        if (resolved.kind === "zone") {
          orderZoneName = resolved.zoneName;
          snapshotZoneName = resolved.zoneName;
        } else {
          // outside-allowed: служебная зона с ценой настройки, деньги считает calculateOrder
          orderZoneName = OUTSIDE_ZONE_NAME;
          snapshotZoneName = "Вне зон";
          orderZones = [
            ...settings.delivery.zones,
            {
              name: OUTSIDE_ZONE_NAME,
              enabled: true,
              deliveryMinutes: null,
              tariffs: [{ from: 0, price: geo.outsidePrice }],
            },
          ];
        }
      }
    }
  }

  const calc = calculateOrder({
    items: pricedItems,
    // При наличии варианта зоны не участвуют: считаем позиции как pickup
    type: option ? "pickup" : input.type,
    zoneName: orderZoneName ?? input.zoneName,
    zones: orderZones,
    minOrder: input.type === "delivery" ? settings.delivery.minOrder : 0,
    requestedBonusSpend: customerId ? input.bonusSpend : 0,
    bonusBalance,
    maxSpendPercent: loyaltyEnabled ? settings.loyalty.maxSpendPercent : 0,
    cashbackPercent: loyaltyEnabled ? settings.loyalty.cashbackPercent : 0,
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
          loyaltyEnabled ? settings.loyalty.cashbackPercent : 0,
          calc.bonusSpent,
        )
      : calc.bonusAccrued;

  // Атомарно: создание заказа + списание бонусов одной транзакцией,
  // с повторной проверкой баланса внутри (защита от конкурентного списания)
  let order;
  try {
    order = await prisma.$transaction(async (tx) => {
      if (tracking && requestKey) {
        const lock = `guest-checkout:${tracking.id}:${requestKey}`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lock}))`;
        const existing = await tx.guestCheckout.findUnique({ where: { sessionId_requestKey: { sessionId:tracking.id, requestKey } } });
        if (existing) throw new Error("GUEST_CHECKOUT_REPLAY");
      }
      if (customerId && calc.bonusSpent > 0) {
        const enough = await lockAndCheckBonusBalance(tx, customerId, calc.bonusSpent);
        if (!enough) {
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
          preferredChannel: input.preferredChannel,
          addressText: storedAddress,
          comment: input.comment,
          desiredTime: desiredTimeText,
          preOrderDate: preOrderData?.preOrderDate ?? null,
          preOrderTime: preOrderData?.preOrderTime ?? null,
          preOrderTz: preOrderData?.preOrderTz ?? null,
          deliveryMode: input.type === "delivery" ? (option?.mode ?? null) : null,
          deliveryDate: input.type === "delivery" && option?.mode === "scheduled" ? input.deliveryDate : null,
          deliverySlotStart:
            input.type === "delivery" && option?.mode === "scheduled" ? input.deliverySlotStart : null,
          deliverySlotEnd:
            input.type === "delivery" && option?.mode === "scheduled" ? input.deliverySlotEnd : null,
          deliveryTz: input.type === "delivery" ? ((settings as { timezone?: string }).timezone ?? "Europe/Moscow") : null,
          deliveryOptionName,
          deliveryZoneName: input.type === "delivery" ? snapshotZoneName : null,
          items: {
            create: orderLines.map((l) => ({
              dishId: l.dishId,
              name: l.name,
              price: l.price,
              menuName: l.menuName,
              quantity: l.quantity,
              modifiers: l.modifiers,
              total: l.total,
            })),
          },
        },
        include: { items: true },
      });

      if (tracking && requestKey) {
        await tx.guestCheckout.create({ data: { sessionId:tracking.id, requestKey, requestHash, orderId:created.id } });
      }
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

      if (input.paymentMethod !== "online") {
        await recordAdminEvent(tx, "order", created.id, `Заказ №${created.number}`);
      }

      return created;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "GUEST_CHECKOUT_REPLAY" && tracking && requestKey) {
      return (await replayCheckout(tracking.id,requestKey,requestHash))!;
    }
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
    const canonical = settings.domains.canonical;
    const baseUrl = canonical.startsWith("http") ? canonical : `https://${canonical}`;
    const { paymentAmountForOrder } = await import("@/lib/order/pricing");
    const amount = paymentAmountForOrder({
      itemsTotal: calc.itemsTotal,
      deliveryPrice: deliveryPriceFinal,
      bonusSpent: calc.bonusSpent,
    });
    try {
      const payment = await paymentProvider!.createPayment({
        orderId: order.id,
        orderNumber: order.number,
        amount,
        description: `Заказ №${order.number}`,
        returnUrl: `${baseUrl}/order/success?n=${order.number}`,
      });
      confirmationUrl = payment.confirmationUrl;
      await prisma.order.update({ where: { id: order.id }, data: { paymentId: payment.paymentId } });
      if (tracking) await prisma.guestCheckout.update({ where: { orderId:order.id }, data: { confirmationUrl } });
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
      if (tracking) {
        const failed = await prisma.order.findUniqueOrThrow({ where: { id:order.id } });
        return attachOrderConfirmation(privateOrderJson({ createdOrder:true, orderNumber:order.number,
          order:guestOrderSummary(failed,requestKey), error:"Заказ сохранён, но оплата не прошла. Свяжитесь с рестораном." },502),order.id);
      }
      return NextResponse.json({ error:"Не удалось создать платёж. Выберите оплату при получении или попробуйте позже." },{ status:502 });
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
    // Web push сотрудникам — фоном, после ответа (дожим — job push-delivery)
    try {
      const { schedulePushAttempt } = await import("@/lib/admin-push");
      schedulePushAttempt("order", order.id);
    } catch {
      // push не должен ронять заказ
    }
  }

  // Мгновенный репорт метрик на платформу (fire-and-forget, заказ не ждёт)
  try {
    const { runMetricsReport } = await import("@/lib/metrics-report");
    void runMetricsReport().catch(() => {});
  } catch {
    // метрики не должны ронять заказ
  }

  const latest = tracking ? await prisma.order.findUniqueOrThrow({ where:{ id:order.id } }) : order;
  if (tracking && (isGuestOrderFinished(latest) || latest.paymentStatus !== "pending")) confirmationUrl = null;
  return attachOrderConfirmation(privateOrderJson({
    ok: true,
    ...(tracking ? { createdOrder:true, order:guestOrderSummary(latest,requestKey) } : {}),
    orderNumber: order.number,
    total: totalFinal,
    itemsTotal: calc.itemsTotal,
    deliveryPrice: deliveryPriceFinal,
    bonusSpent: calc.bonusSpent,
    confirmationUrl,
  }), order.id);
}
