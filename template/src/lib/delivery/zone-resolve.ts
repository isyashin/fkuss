/**
 * Определение зоны доставки по адресу: геокодинг -> точка в полигонах зон.
 * Только резолв: цену считает pricing.ts (единая точка расчёта денег).
 */
import { findZoneByPoint } from "./geo";
import type { GeocodeResult, GeocodeError } from "./geocoder";
import type { DeliveryZone } from "@/lib/order/pricing";

/** Служебное имя зоны для заказов вне полигонов (outside = "allow").
 *  Начинается с "__", чтобы не пересечься с именами зон администратора. */
export const OUTSIDE_ZONE_NAME = "__outside__";

export type GeoDeliveryResult =
  | { kind: "zone"; zoneName: string; lat: number; lng: number }
  | { kind: "outside-blocked"; lat: number; lng: number }
  | { kind: "outside-allowed"; lat: number; lng: number }
  | { kind: "address-not-found" }
  | { kind: "geocoder-error"; error: Exclude<GeocodeError, { kind: "not-found" }> };

export async function resolveGeoDelivery(input: {
  address: string;
  zones: DeliveryZone[];
  outside: "block" | "allow";
  outsidePrice: number; // для ответа API; цену заказа считает calculateOrder по zoneName
  geocode: (address: string) => Promise<GeocodeResult>;
}): Promise<GeoDeliveryResult> {
  const result = await input.geocode(input.address);
  if (!result.ok) {
    if (result.error.kind === "not-found") return { kind: "address-not-found" };
    return { kind: "geocoder-error", error: result.error };
  }

  const { lat, lng } = result.point;
  const zoneName = findZoneByPoint(lat, lng, input.zones);
  if (zoneName) return { kind: "zone", zoneName, lat, lng };

  return input.outside === "allow"
    ? { kind: "outside-allowed", lat, lng }
    : { kind: "outside-blocked", lat, lng };
}
