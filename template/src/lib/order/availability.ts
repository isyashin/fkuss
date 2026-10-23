import type { ContentSettings } from "@/lib/content-schema";
import { deliveryGeoMode } from "@/lib/delivery/geo-policy";
import { generateWindows, isOptionAvailableOn, type DeliveryOptionRule } from "@/lib/delivery/slots";
import { isOpenAt, nowInTimeZone, resolveSchedule } from "@/lib/hours";
import { generatePreOrderSlots, normalizePreOrder } from "@/lib/order/preorder";

export const CLOSED_WITHOUT_SLOTS = "Сейчас ресторан закрыт. Доступного времени для заказа пока нет.";
export const CLOSED_WITH_SLOTS = "Сейчас ресторан закрыт. Можно оформить предзаказ на доступное время.";

type ConfiguredOption = Omit<DeliveryOptionRule, "mode"> & { id: string; mode: string };

/** The storefront and checkout use the same slots and enabled fulfilment methods.
 * An enabled preorder switch alone does not guarantee a usable future time. */
export function orderAvailability(
  settings: Pick<ContentSettings, "delivery" | "preOrder" | "timezone">,
  restaurant: Parameters<typeof resolveSchedule>[0],
  configuredOptions: ConfiguredOption[],
  now = new Date(),
) {
  const tz = settings.timezone ?? "Europe/Moscow";
  const local = nowInTimeZone(tz, now);
  const asapAvailable = isOpenAt(resolveSchedule(restaurant), local.date, local.time);
  const options = configuredOptions.filter(o => o.enabled).map(option => {
    const rule = option as DeliveryOptionRule;
    const windows = option.mode === "scheduled" ? generateWindows(rule, now, tz) : [];
    const available = option.mode === "asap"
      ? asapAvailable && isOptionAvailableOn(rule, now, tz) && local.time >= option.hoursFrom && local.time < option.hoursTo
      : windows.length > 0;
    return { id: option.id, name: option.name, mode: option.mode, price: option.price, freeFrom: option.freeFrom, available, windows };
  });
  const preOrder = {
    enabled: normalizePreOrder(settings.preOrder).enabled,
    slots: generatePreOrderSlots(settings.preOrder, now, tz),
  };
  const hasConfiguredOptions = configuredOptions.length > 0;
  const deliveryEnabled = settings.delivery.enabled && deliveryGeoMode(settings.delivery) !== "invalid";
  const genericPreOrder = preOrder.slots.length > 0 && (
    settings.delivery.pickupEnabled || (deliveryEnabled && !hasConfiguredOptions)
  );
  const scheduledDelivery = deliveryEnabled && options.some(o => o.mode === "scheduled" && o.available);
  const closedMessage = asapAvailable ? null : genericPreOrder || scheduledDelivery ? CLOSED_WITH_SLOTS : CLOSED_WITHOUT_SLOTS;
  return { options, hasConfiguredOptions, asapAvailable, preOrder, tz, closedMessage };
}
