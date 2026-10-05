"use client";

import { useEffect, useRef } from "react";
import { loadYmaps, type YMapsApi, type YMap, type YGeoObject } from "./ymaps";

export interface MapZone {
  name: string;
  polygon: [number, number][];
}

export const ZONE_PALETTE = [
  { stroke: "#1e98ff", fill: "rgba(30, 152, 255, 0.16)" },
  { stroke: "#f2463a", fill: "rgba(242, 70, 58, 0.14)" },
  { stroke: "#4caf50", fill: "rgba(76, 175, 80, 0.14)" },
  { stroke: "#9c27b0", fill: "rgba(156, 39, 176, 0.12)" },
  { stroke: "#ff9800", fill: "rgba(255, 152, 0, 0.14)" },
];

/** Мини-карта зон доставки с точкой адреса (подтверждение зоны гостем). */
export function DeliveryMap({
  ymapsKey,
  zones,
  point,
}: {
  ymapsKey: string;
  zones: MapZone[];
  point: { lat: number; lng: number } | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ymapsRef = useRef<YMapsApi | null>(null);
  const mapRef = useRef<YMap | null>(null);
  const placemarkRef = useRef<YGeoObject | null>(null);

  const zonesKey = JSON.stringify(zones.map((z) => [z.name, z.polygon]));

  // Создание карты и полигонов — один раз на набор зон
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !ymapsKey || zones.length === 0) return;
    let disposed = false;

    loadYmaps(ymapsKey)
      .then((ymaps) => {
        if (disposed || !containerRef.current) return;
        ymapsRef.current = ymaps;
        const map = new ymaps.Map(
          containerRef.current,
          { center: [55.76, 37.64], zoom: 10 },
          { suppressObsoleteBrowserNotifier: true },
        );
        mapRef.current = map;

        zones.forEach((zone, i) => {
          const color = ZONE_PALETTE[i % ZONE_PALETTE.length];
          const ring = zone.polygon.map(([lat, lng]) => [lat, lng]);
          map.geoObjects.add(
            new ymaps.Polygon(
              [ring],
              { hintContent: zone.name },
              { strokeColor: color.stroke, fillColor: color.fill, strokeWidth: 2 },
            ),
          );
        });
        const bounds = map.geoObjects.getBounds();
        if (bounds) map.setBounds(bounds, { zoomMargin: 24, checkZoomRange: true });
      })
      .catch(() => {});

    return () => {
      disposed = true;
      placemarkRef.current = null;
      mapRef.current?.destroy();
      mapRef.current = null;
      ymapsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ymapsKey, zonesKey]);

  // Точка адреса: создаём/двигаем метку и центрируем карту
  useEffect(() => {
    const map = mapRef.current;
    const ymaps = ymapsRef.current;
    if (!map || !ymaps) return;
    if (!point) {
      if (placemarkRef.current) {
        map.geoObjects.remove(placemarkRef.current);
        placemarkRef.current = null;
      }
      return;
    }
    const coords: [number, number] = [point.lat, point.lng];
    if (placemarkRef.current) {
      placemarkRef.current.geometry.setCoordinates(coords);
    } else {
      const placemark = new ymaps.Placemark(coords, {}, { preset: "islands#redDotIcon" });
      map.geoObjects.add(placemark);
      placemarkRef.current = placemark;
    }
    map.setCenter(coords);
  }, [point]);

  if (zones.length === 0) return null;
  return <div ref={containerRef} className="h-44 w-full rounded-[var(--radius)] overflow-hidden bg-foreground/5" />;
}
