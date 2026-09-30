"use client";

/**
 * Редактор зон доставки на Яндекс.Карте: рисование полигонов и правка границ.
 * Источник правды по имени/цене — список зон в родительской форме; отсюда
 * вверх уходят только изменения polygon.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { loadYmaps, type YMapsApi, type YMap, type YPolygon } from "@/components/cart/ymaps";
import { ZONE_PALETTE } from "@/components/cart/delivery-map";

export interface GeoZoneDraft {
  name: string;
  price: number;
  freeFrom: number | null;
  polygon?: [number, number][];
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export function GeoZonesEditor({
  ymapsKey,
  zones,
  onZonesChange,
}: {
  ymapsKey: string;
  zones: GeoZoneDraft[];
  onZonesChange: (zones: GeoZoneDraft[]) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ymapsRef = useRef<YMapsApi | null>(null);
  const mapRef = useRef<YMap | null>(null);
  const polygonsRef = useRef<Map<number, YPolygon>>(new Map());
  const zonesRef = useRef(zones);
  const onChangeRef = useRef(onZonesChange);

  // Рефы-зеркала для асинхронных колбэков (линтер запрещает писать их в рендере)
  useEffect(() => {
    zonesRef.current = zones;
  }, [zones]);
  useEffect(() => {
    onChangeRef.current = onZonesChange;
  }, [onZonesChange]);

  const [selected, setSelected] = useState<number | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);

  const stopAllEditing = useCallback(() => {
    polygonsRef.current.forEach((p) => {
      p.editor.stopEditing();
      p.editor.stopDrawing();
    });
  }, []);

  /** Перечитываем все полигоны с карты в zones (вверх) */
  const syncUp = useCallback(() => {
    const current = zonesRef.current;
    const next = current.map((zone, i) => {
      const polygon = polygonsRef.current.get(i);
      if (!polygon) return zone;
      const ring = polygon.geometry.getCoordinates()[0] ?? [];
      if (ring.length < 3) return { ...zone, polygon: undefined };
      return {
        ...zone,
        polygon: ring.map(([lat, lng]) => [round6(lat), round6(lng)] as [number, number]),
      };
    });
    onChangeRef.current(next);
  }, []);

  const zonesKey = JSON.stringify(zones.map((z, i) => [i, z.name, z.polygon ?? null]));

  // Создание карты и синхронизация полигонов со списком зон
  useEffect(() => {
    if (!containerRef.current || !ymapsKey) return;
    let disposed = false;

    loadYmaps(ymapsKey)
      .then((ymaps) => {
        if (disposed || !containerRef.current) return;
        ymapsRef.current = ymaps;
        if (!mapRef.current) {
          mapRef.current = new ymaps.Map(
            containerRef.current,
            { center: [55.76, 37.64], zoom: 10 },
            { suppressObsoleteBrowserNotifier: true },
          );
        }
        const map = mapRef.current;

        // Удаляем полигоны зон, которых больше нет или у которых пропал polygon
        for (const [index, polygon] of polygonsRef.current) {
          const zone = zonesRef.current[index];
          if (!zone || (zone.polygon?.length ?? 0) < 3) {
            polygon.editor.stopEditing();
            map.geoObjects.remove(polygon);
            polygonsRef.current.delete(index);
          }
        }

        // Создаём недостающие
        zonesRef.current.forEach((zone, i) => {
          if ((zone.polygon?.length ?? 0) < 3 || polygonsRef.current.has(i)) return;
          const color = ZONE_PALETTE[i % ZONE_PALETTE.length];
          const ring = zone.polygon!.map(([lat, lng]) => [lat, lng]);
          const polygon = new ymaps.Polygon(
            [ring],
            { hintContent: zone.name },
            { strokeColor: color.stroke, fillColor: color.fill, strokeWidth: 2 },
          );
          map.geoObjects.add(polygon);
          polygonsRef.current.set(i, polygon);
        });

        if (polygonsRef.current.size > 0) {
          const bounds = map.geoObjects.getBounds();
          if (bounds) map.setBounds(bounds, { zoomMargin: 24, checkZoomRange: true });
        }
      })
      .catch(() => setMapFailed(true));

    return () => {
      disposed = true;
    };
     
  }, [ymapsKey, zonesKey]);

  // Размонтирование — уничтожаем карту
  useEffect(() => {
    const polygons = polygonsRef.current;
    return () => {
      polygons.clear();
      mapRef.current?.destroy();
      mapRef.current = null;
      ymapsRef.current = null;
    };
  }, []);

  function startDraw(index: number) {
    const ymaps = ymapsRef.current;
    const map = mapRef.current;
    if (!ymaps || !map || drawing) return;
    stopAllEditing();
    setEditing(false);
    // Перерисовка: старый полигон зоны убираем
    const old = polygonsRef.current.get(index);
    if (old) {
      map.geoObjects.remove(old);
      polygonsRef.current.delete(index);
    }
    const color = ZONE_PALETTE[index % ZONE_PALETTE.length];
    const polygon = new ymaps.Polygon(
      [[]],
      { hintContent: zonesRef.current[index]?.name ?? "" },
      { strokeColor: color.stroke, fillColor: color.fill, strokeWidth: 2 },
    );
    map.geoObjects.add(polygon);
    polygonsRef.current.set(index, polygon);
    setDrawing(true);
    polygon.editor.events.add("drawingcomplete", () => {
      setDrawing(false);
      syncUp();
    });
    polygon.editor.startDrawing();
  }

  function startEdit(index: number) {
    const polygon = polygonsRef.current.get(index);
    if (!polygon || editing) return;
    stopAllEditing();
    polygon.editor.startEditing();
    setEditing(true);
  }

  function finishEdit() {
    stopAllEditing();
    setEditing(false);
    syncUp();
  }

  if (!ymapsKey) {
    return (
      <p className="text-sm text-muted">
        Для рисования зон задайте ключ <code>YANDEX_MAPS_API_KEY</code> в настройках сайта.
        Без ключа зоны работают без карты (выбор гостем из списка).
      </p>
    );
  }
  if (mapFailed) {
    return <p className="text-sm text-red-600">Карта не загрузилась. Проверьте ключ YANDEX_MAPS_API_KEY.</p>;
  }

  const selectedZone = selected !== null ? zones[selected] : undefined;
  const selectedHasPolygon = (selectedZone?.polygon?.length ?? 0) >= 3;

  return (
    <div className="space-y-3">
      <div ref={containerRef} className="h-80 w-full rounded-[var(--radius)] overflow-hidden bg-foreground/5" />

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={selected ?? ""}
          onChange={(e) => setSelected(e.target.value === "" ? null : Number(e.target.value))}
          className="min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15"
          aria-label="Зона для работы на карте"
        >
          <option value="">Выберите зону…</option>
          {zones.map((z, i) => (
            <option key={i} value={i}>
              {z.name || `Зона ${i + 1}`}
              {(z.polygon?.length ?? 0) >= 3 ? " (на карте)" : " (без полигона)"}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={selected === null || drawing}
          onClick={() => selected !== null && startDraw(selected)}
          className="min-h-11 px-4 rounded-full bg-accent text-white text-sm font-medium disabled:opacity-40"
        >
          {selectedHasPolygon ? "Перерисовать" : "Нарисовать зону"}
        </button>
        <button
          type="button"
          disabled={!selectedHasPolygon || drawing || editing}
          onClick={() => selected !== null && startEdit(selected)}
          className="min-h-11 px-4 rounded-full border border-foreground/20 text-sm disabled:opacity-40"
        >
          Править границу
        </button>
        {editing && (
          <button
            type="button"
            onClick={finishEdit}
            className="min-h-11 px-4 rounded-full bg-accent text-white text-sm font-medium"
          >
            Готово
          </button>
        )}
      </div>

      <p className="text-sm text-muted">
        {drawing
          ? "Кликайте по карте, ставя точки границы; двойной клик завершает полигон."
          : editing
            ? "Перетаскивайте точки границы; «Готово» — закончить правку."
            : "Нарисуйте полигон зоны на карте: клик — точка границы, двойной клик — завершение."}
      </p>
    </div>
  );
}
