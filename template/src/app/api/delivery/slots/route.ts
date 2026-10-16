import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/db";
import { generateWindows, isOptionAvailableOn, type DeliveryOptionRule } from "@/lib/delivery/slots";
import { generatePreOrderSlots, normalizePreOrder } from "@/lib/order/preorder";
import { getSiteRestaurant, getSiteSettings } from "@/lib/site";
import { isOpenAt, nowInTimeZone, resolveSchedule } from "@/lib/hours";

const DEFAULT_TZ = "Europe/Moscow";

/** Варианты доставки и доступные окна: GET /api/delivery/slots */
export async function GET() {
  const prisma = getPrisma();
  const [settings, restaurant] = await Promise.all([getSiteSettings(), getSiteRestaurant()]);
  const tz = (settings as { timezone?: string }).timezone ?? DEFAULT_TZ;

  const options = await prisma.deliveryOption.findMany({
    where: { enabled: true },
    orderBy: { position: "asc" },
  });

  const now = new Date();
  const local = nowInTimeZone(tz, now);
  const asapAvailable = isOpenAt(resolveSchedule(restaurant), local.date, local.time);
  const result = options.map((option) => {
    const rule = option as DeliveryOptionRule;
    // F03: витрина не должна предлагать вариант, который сервер отклонит
    // (ни одного дня недели / сегодняшняя дата в исключениях / нет окон).
    const available =
      option.mode === "asap"
        ? asapAvailable && isOptionAvailableOn(rule, now, tz) && local.time >= option.hoursFrom && local.time < option.hoursTo
        : generateWindows(rule, now, tz).length > 0;
    return {
      id: option.id,
      name: option.name,
      mode: option.mode,
      price: option.price,
      freeFrom: option.freeFrom,
      available,
      windows: option.mode === "scheduled" ? generateWindows(rule, now, tz) : [],
    };
  });

  return NextResponse.json({
    options: result,
    asapAvailable,
    // Предзаказ ко времени (самовывоз / доставка без вариантов)
    preOrder: { enabled: normalizePreOrder(settings.preOrder).enabled, slots: generatePreOrderSlots(settings.preOrder, now, tz) },
    tz,
  });
}
