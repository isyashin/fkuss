/**
 * Геометрия зон доставки. Полигон хранится как [[lat, lng], ...]
 * (так же, как в settings.delivery.zones[].polygon).
 */

export type GeoPolygon = [number, number][];

export interface GeoZoneLike {
  name: string;
  enabled?: boolean;
  polygon?: GeoPolygon;
}

/** Point-in-polygon лучевым методом. Граничные случаи относятся к «вне» — зоны
 *  рисуются с запасом, а матчинг по границе не должен ломать заказ. */
export function pointInPolygon(lat: number, lng: number, polygon: GeoPolygon): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [piLat, piLng] = polygon[i];
    const [pjLat, pjLng] = polygon[j];
    if (piLng > lng !== pjLng > lng) {
      const boundaryLat = ((pjLat - piLat) * (lng - piLng)) / (pjLng - piLng) + piLat;
      if (lat < boundaryLat) inside = !inside;
    }
  }
  return inside;
}

/** Первая включённая зона в списке, чей полигон содержит точку; зоны без polygon пропускаются. */
export function findZoneByPoint(lat: number, lng: number, zones: GeoZoneLike[]): string | null {
  for (const zone of zones) {
    if (zone.enabled === false) continue;
    if (zone.polygon && zone.polygon.length >= 3 && pointInPolygon(lat, lng, zone.polygon)) {
      return zone.name;
    }
  }
  return null;
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Стартовый полигон новой зоны: восьмиугольник radiusKm вокруг центра
 *  (ресторана или центра карты) — зона появляется сразу и её можно тянуть. */
export function defaultZonePolygon(
  center: { lat: number; lng: number },
  radiusKm = 1.2,
): [number, number][] {
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.cos((center.lat * Math.PI) / 180));
  const points: [number, number][] = [];
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI / 4) * i;
    points.push([
      round6(center.lat + dLat * Math.sin(angle)),
      round6(center.lng + dLng * Math.cos(angle)),
    ]);
  }
  return points;
}
