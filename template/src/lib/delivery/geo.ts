/**
 * Геометрия зон доставки. Полигон хранится как [[lat, lng], ...]
 * (так же, как в settings.delivery.zones[].polygon).
 */

export type GeoPolygon = [number, number][];

export interface GeoZoneLike {
  name: string;
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

/** Первая зона в списке, чей полигон содержит точку; зоны без polygon пропускаются. */
export function findZoneByPoint(lat: number, lng: number, zones: GeoZoneLike[]): string | null {
  for (const zone of zones) {
    if (zone.polygon && zone.polygon.length >= 3 && pointInPolygon(lat, lng, zone.polygon)) {
      return zone.name;
    }
  }
  return null;
}
