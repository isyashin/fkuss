import type { GeoZoneLike } from "./geo";

export const GEO_CONFIGURATION_ERROR = "Добавьте и включите хотя бы одну зону с границами.";
export const GEO_ADDRESS_ERROR = "Не удалось найти точный адрес дома. Уточните город, улицу и номер дома.";

/** Independent of delivery options and browser map keys. */
export function deliveryGeoMode(delivery: { geo?: { enabled?: boolean }; zones: GeoZoneLike[] }): "disabled" | "invalid" | "active" {
  if (!delivery.geo?.enabled) return "disabled";
  return delivery.zones.some(zone => zone.enabled !== false && (zone.polygon?.length ?? 0) >= 3) ? "active" : "invalid";
}
