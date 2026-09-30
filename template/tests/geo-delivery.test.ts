import { describe, it, expect } from "vitest";
import { resolveGeoDelivery, OUTSIDE_ZONE_NAME } from "@/lib/delivery/zone-resolve";
import type { GeocodeResult } from "@/lib/delivery/geocoder";
import type { DeliveryZone } from "@/lib/order/pricing";

const square: [number, number][] = [
  [55.0, 37.0],
  [55.0, 38.0],
  [56.0, 38.0],
  [56.0, 37.0],
];
const farAway: [number, number][] = [
  [60.0, 40.0],
  [60.0, 41.0],
  [61.0, 41.0],
  [61.0, 40.0],
];

const zones: DeliveryZone[] = [
  { name: "Центр", price: 200, freeFrom: 2000, polygon: square },
  { name: "Дальняя", price: 400, freeFrom: null, polygon: farAway },
];

const okAt = (lat: number, lng: number): GeocodeResult => ({
  ok: true,
  point: { lat, lng, formatted: "Адрес" },
});

function resolver(geocode: (a: string) => Promise<GeocodeResult>, outside: "block" | "allow" = "block") {
  return resolveGeoDelivery({
    address: "Тестовый адрес",
    zones,
    outside,
    outsidePrice: 500,
    geocode,
  });
}

describe("resolveGeoDelivery", () => {
  it("адрес внутри полигона — зона найдена, координаты в ответе", async () => {
    const r = await resolver(async () => okAt(55.5, 37.5));
    expect(r).toEqual({ kind: "zone", zoneName: "Центр", lat: 55.5, lng: 37.5 });
  });

  it("выбирается зона по координатам, а не по тексту адреса", async () => {
    // Геокодер вернул точку в «Дальней», хотя текст про центр
    const r = await resolver(async () => okAt(60.5, 40.5));
    expect(r).toEqual({ kind: "zone", zoneName: "Дальняя", lat: 60.5, lng: 40.5 });
  });

  it("пересечение полигонов: первое попадание в списке", async () => {
    const inner: [number, number][] = [
      [55.2, 37.2],
      [55.2, 37.8],
      [55.8, 37.8],
      [55.8, 37.2],
    ];
    const nested: DeliveryZone[] = [
      { name: "Внешняя", price: 100, freeFrom: null, polygon: square },
      { name: "Внутренняя", price: 50, freeFrom: null, polygon: inner },
    ];
    const r = await resolveGeoDelivery({
      address: "А",
      zones: nested,
      outside: "block",
      outsidePrice: 0,
      geocode: async () => okAt(55.5, 37.5),
    });
    expect(r).toEqual({ kind: "zone", zoneName: "Внешняя", lat: 55.5, lng: 37.5 });
  });

  it("вне всех зон + block — outside-blocked с координатами", async () => {
    const r = await resolver(async () => okAt(0, 0));
    expect(r).toEqual({ kind: "outside-blocked", lat: 0, lng: 0 });
  });

  it("вне всех зон + allow — outside-allowed", async () => {
    const r = await resolver(async () => okAt(0, 0), "allow");
    expect(r).toEqual({ kind: "outside-allowed", lat: 0, lng: 0 });
  });

  it("зоны без polygon не участвуют в матчинге", async () => {
    const noGeo: DeliveryZone[] = [{ name: "Старая", price: 100, freeFrom: null }];
    const r = await resolveGeoDelivery({
      address: "А",
      zones: noGeo,
      outside: "block",
      outsidePrice: 0,
      geocode: async () => okAt(55.5, 37.5),
    });
    expect(r).toEqual({ kind: "outside-blocked", lat: 55.5, lng: 37.5 });
  });

  it("адрес не найден геокодером — address-not-found", async () => {
    const r = await resolver(async () => ({ ok: false as const, error: { kind: "not-found" as const } }));
    expect(r).toEqual({ kind: "address-not-found" });
  });

  it("сбой геокодера — geocoder-error с типом ошибки", async () => {
    const r = await resolver(async () => ({ ok: false as const, error: { kind: "unavailable" as const } }));
    expect(r).toEqual({ kind: "geocoder-error", error: { kind: "unavailable" } });

    const r2 = await resolver(async () => ({ ok: false as const, error: { kind: "invalid-key" as const } }));
    expect(r2).toEqual({ kind: "geocoder-error", error: { kind: "invalid-key" } });
  });

  it("имя служебной зоны вне зон не совпадает с пользовательскими", () => {
    expect(OUTSIDE_ZONE_NAME.startsWith("__")).toBe(true);
  });
});
