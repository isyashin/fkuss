import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getSiteSettings } from "@/lib/site";
import { geocodeAddress } from "@/lib/delivery/geocoder";
import { resolveGeoDelivery } from "@/lib/delivery/zone-resolve";
import { calculateDeliveryPrice, zoneTariffs } from "@/lib/order/pricing";

function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * Превью зоны доставки по адресу: GET /api/delivery/zone?address=...&total=...
 * total — текущая сумма корзины (для freeFrom). Ответ:
 * { kind: "zone", zoneName, deliveryPrice, freeFrom } |
 * { kind: "outside-allowed", deliveryPrice } |
 * { kind: "outside-blocked" } | { kind: "address-not-found" } |
 * { kind: "geocoder-error" } | { kind: "disabled" }
 */
export async function GET(request: Request) {
  const ip = getClientIp(request);
  // Геокодер платный сверх лимита: не даём упереться в потолок автоматом браузера
  if (!rateLimit(`delivery-zone:${ip}`, 20, 60 * 1000)) {
    return NextResponse.json({ error: "Слишком много запросов. Подождите минуту." }, { status: 429 });
  }

  const url = new URL(request.url);
  const address = url.searchParams.get("address")?.trim() ?? "";
  const totalRaw = url.searchParams.get("total");
  const itemsTotal = totalRaw === null ? 0 : Number(totalRaw);
  if (!address || !Number.isFinite(itemsTotal) || itemsTotal < 0) {
    return NextResponse.json({ error: "Проверьте параметры запроса" }, { status: 400 });
  }

  const settings = await getSiteSettings();
  const geo = settings.delivery.geo ?? { enabled: false, outside: "block" as const, outsidePrice: 0 };
  const hasPolygons = settings.delivery.zones.some((z) => (z.polygon?.length ?? 0) >= 3);
  if (!geo.enabled || !hasPolygons) {
    return NextResponse.json({ kind: "disabled" });
  }

  const resolved = await resolveGeoDelivery({
    address,
    zones: settings.delivery.zones,
    outside: geo.outside,
    outsidePrice: geo.outsidePrice,
    geocode: geocodeAddress,
  });

  switch (resolved.kind) {
    case "zone": {
      const zone = settings.delivery.zones.find((z) => z.name === resolved.zoneName);
      const deliveryPrice = calculateDeliveryPrice(
        "delivery",
        itemsTotal,
        settings.delivery.zones,
        resolved.zoneName,
      );
      return NextResponse.json({
        kind: "zone",
        zoneName: resolved.zoneName,
        deliveryPrice,
        tariffs: zoneTariffs(zone ?? { name: resolved.zoneName }),
        deliveryMinutes: zone?.deliveryMinutes ?? null,
        lat: resolved.lat,
        lng: resolved.lng,
      });
    }
    case "outside-allowed":
      return NextResponse.json({
        kind: "outside-allowed",
        deliveryPrice: geo.outsidePrice,
        lat: resolved.lat,
        lng: resolved.lng,
      });
    case "outside-blocked":
      return NextResponse.json({ kind: "outside-blocked", lat: resolved.lat, lng: resolved.lng });
    case "address-not-found":
      return NextResponse.json({ kind: "address-not-found" });
    case "geocoder-error":
      return NextResponse.json({ kind: "geocoder-error" });
  }
}
