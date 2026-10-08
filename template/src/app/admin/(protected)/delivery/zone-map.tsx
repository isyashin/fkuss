"use client";

/**
 * Карта зон доставки (по образцу Яндекс.Еды).
 * Модель взаимодействия: «Добавить зону» -> готовый полигон вокруг ресторана,
 * выбор зоны (строка или клик по полигону) = сразу режим правки: тянешь тело
 * или вершины. Свободное рисование — только для зон без полигона (legacy),
 * завершение кнопкой «Готово» или двойным кликом.
 */
import { useCallback, useEffect, useRef } from "react";
import { loadYmaps, type YMapsApi, type YMap, type YPolygon } from "@/components/cart/ymaps";
import { ZONE_PALETTE } from "@/components/cart/delivery-map";
import type { ContentSettings } from "@/lib/content-schema";

type Zone = ContentSettings["delivery"]["zones"][number];

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

export function zoneColor(index: number) {
  return ZONE_PALETTE[index % ZONE_PALETTE.length];
}

/** Границы только полигонов зон (без метки ресторана), с запасом 25% */
function polygonsBounds(zones: Zone[]): [[number, number], [number, number]] | null {
  let minLat = Infinity;
  let minLng = Infinity;
  let maxLat = -Infinity;
  let maxLng = -Infinity;
  for (const zone of zones) {
    for (const [lat, lng] of zone.polygon ?? []) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
  }
  if (!Number.isFinite(minLat)) return null;
  const padLat = (maxLat - minLat) * 0.25 || 0.005;
  const padLng = (maxLng - minLng) * 0.25 || 0.005;
  return [
    [minLat - padLat, minLng - padLng],
    [maxLat + padLat, maxLng + padLng],
  ];
}

export function ZoneMap({
  ymapsKey,
  zones,
  selectedIndex,
  restaurantCenter,
  onZonesChange,
  onSelect,
  drawToken,
  stopDrawToken,
  stopEditToken,
  onBusyChange,
  onMapApi,
}: {
  ymapsKey: string;
  zones: Zone[];
  selectedIndex: number | null;
  /** Координаты ресторана (серверный геокодинг адреса) — центр и метка карты */
  restaurantCenter: { lat: number; lng: number } | null;
  onZonesChange: (zones: Zone[]) => void;
  onSelect: (index: number) => void;
  /** nonce: начать свободное рисование для выбранной зоны (только без polygon) */
  drawToken: number;
  /** nonce: завершить рисование (кнопка «Готово») */
  stopDrawToken: number;
  /** nonce: завершить правку (кнопка «Готово») */
  stopEditToken: number;
  onBusyChange: (busy: { drawing: boolean; editing: boolean }) => void;
  /** Центр карты для дефолтного полигона, если геокод ресторана не дал координат */
  onMapApi?: (api: { getCenter: () => [number, number] }) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ymapsRef = useRef<YMapsApi | null>(null);
  const mapRef = useRef<YMap | null>(null);
  const polygonsRef = useRef<Map<number, YPolygon>>(new Map());
  const lastRaisedRef = useRef<number | null>(null);  /** Индекс зоны в режиме свободного рисования («карандаш») */
  const drawingIndexRef = useRef<number | null>(null);
  /** Индекс зоны в режиме правки (drag тела/вершин) */
  const editingIndexRef = useRef<number | null>(null);
  /** Выбор опередил создание полигона — правку стартуем после создания */
  const pendingEditRef = useRef<number | null>(null);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editingListenerRef = useRef<{ polygon: YPolygon; handler: () => void } | null>(null);
  const zonesRef = useRef(zones);
  const onChangeRef = useRef(onZonesChange);
  const onSelectRef = useRef(onSelect);
  const onBusyRef = useRef(onBusyChange);
  const onMapApiRef = useRef(onMapApi);

  useEffect(() => {
    zonesRef.current = zones;
  }, [zones]);
  useEffect(() => {
    onChangeRef.current = onZonesChange;
  }, [onZonesChange]);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    onBusyRef.current = onBusyChange;
  }, [onBusyChange]);
  useEffect(() => {
    onMapApiRef.current = onMapApi;
  }, [onMapApi]);

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

  /** Live-синхронизация во время перетаскивания (debounce) */
  const scheduleSync = useCallback(() => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      syncTimerRef.current = null;
      syncUp();
    }, 600);
  }, [syncUp]);

  const setDblClickZoom = useCallback((enabled: boolean) => {
    const map = mapRef.current;
    if (!map) return;
    try {
      if (enabled) map.behaviors.enable("dblClickZoom");
      else map.behaviors.disable("dblClickZoom");
    } catch {
      // старые поведения — не критично
    }
  }, []);

  /** Вход в режим правки зоны */
  const startEditing = useCallback(
    (index: number): boolean => {
      const polygon = polygonsRef.current.get(index);
      const map = mapRef.current;
      if (!polygon || !map) return false;
      stopAllEditing();
      polygon.editor.startEditing();
      editingIndexRef.current = index;
      const handler = () => scheduleSync();
      polygon.geometry.events.add("change", handler);
      editingListenerRef.current = { polygon, handler };
      setDblClickZoom(false);
      onBusyRef.current({ drawing: false, editing: true });
      return true;
    },
    [scheduleSync, setDblClickZoom, stopAllEditing],
  );

  /** Выход из режима правки с сохранением координат */
  const finishEditing = useCallback(() => {
    if (editingListenerRef.current) {
      const { polygon, handler } = editingListenerRef.current;
      polygon.geometry.events.remove("change", handler);
      editingListenerRef.current = null;
    }
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
    }
    stopAllEditing();
    editingIndexRef.current = null;
    setDblClickZoom(true);
    onBusyRef.current({ drawing: false, editing: false });
    syncUp();
  }, [setDblClickZoom, stopAllEditing, syncUp]);

  /** Завершение свободного рисования (общая точка для «Готово» и dblclick) */
  const finishDrawing = useCallback(() => {
    if (drawingIndexRef.current === null) return;
    drawingIndexRef.current = null;
    setDblClickZoom(true);
    onBusyRef.current({ drawing: false, editing: false });
    syncUp();
  }, [setDblClickZoom, syncUp]);

  const zonesKey = JSON.stringify(zones.map((z, i) => [i, z.name, z.polygon ?? null]));
  const fitKey = JSON.stringify(zones.map((z) => z.polygon ?? null));
  const fittedKeyRef = useRef("");

  // Создание карты, синхронизация полигонов, кадр
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
            {
              center: restaurantCenter ? [restaurantCenter.lat, restaurantCenter.lng] : [55.76, 37.64],
              zoom: restaurantCenter ? 14 : 10,
            },
            { suppressObsoleteBrowserNotifier: true },
          );
          if (restaurantCenter) {
            mapRef.current.geoObjects.add(
              new ymaps.Placemark(
                [restaurantCenter.lat, restaurantCenter.lng],
                { hintContent: "Ресторан" },
                { preset: "islands#redIcon", zIndex: 1000, zIndexActive: 1000 },
              ),
            );
          }
          onMapApiRef.current?.({
            getCenter: () => mapRef.current?.getCenter() ?? [55.76, 37.64],
          });
        }
        const map = mapRef.current;

        // Убираем полигоны удалённых зон; «карандаш» рисования не трогаем
        for (const [index, polygon] of polygonsRef.current) {
          if (index === drawingIndexRef.current) continue;
          const zone = zonesRef.current[index];
          if (!zone || (zone.polygon?.length ?? 0) < 3) {
            polygon.editor.stopEditing();
            polygon.editor.stopDrawing();
            map.geoObjects.remove(polygon);
            polygonsRef.current.delete(index);
          }
        }

        // Создаём недостающие полигоны
        zonesRef.current.forEach((zone, i) => {
          if ((zone.polygon?.length ?? 0) < 3 || polygonsRef.current.has(i)) return;
          const color = zoneColor(i);
          const ring = zone.polygon!.map(([lat, lng]) => [lat, lng]);
          const polygon = new ymaps.Polygon(
            [ring],
            { hintContent: zone.name },
            {
              strokeColor: color.stroke,
              fillColor: color.stroke,
              fillOpacity: 0.3,
              strokeWidth: 2,
              zIndex: i,
              draggable: true, // тянуть зону за тело, а не только вершины
            },
          );
          polygon.events.add("click", () => onSelectRef.current(i));
          map.geoObjects.add(polygon);
          polygonsRef.current.set(i, polygon);
        });

        // Подсветка выбранной зоны + вывод её поверх остальных:
        // новая зона создаётся внутри существующих и без этого её нельзя перетащить.
        polygonsRef.current.forEach((polygon, i) => {
          polygon.options.set("strokeWidth", i === selectedIndex ? 4 : 2);
          polygon.options.set("fillOpacity", i === selectedIndex ? 0.5 : 0.3);
          polygon.options.set("zIndex", i === selectedIndex ? 100 : i);
        });
        const selectedPolygon = selectedIndex !== null ? polygonsRef.current.get(selectedIndex) : undefined;
        if (selectedPolygon && lastRaisedRef.current !== selectedIndex) {
          lastRaisedRef.current = selectedIndex;
          map.geoObjects.remove(selectedPolygon);
          map.geoObjects.add(selectedPolygon);
        }

        // Кадр — как в Яндекс.Еде: все зоны всегда целиком в видимой области
        if (fitKey !== fittedKeyRef.current) {
          fittedKeyRef.current = fitKey;
          const bounds = polygonsBounds(zonesRef.current);
          if (bounds) {
            map.setBounds(bounds, { zoomMargin: 60, checkZoomRange: true });
          }
        }

        // Выбор пришёл раньше создания полигона — догоняем
        const pending = pendingEditRef.current;
        if (pending !== null && polygonsRef.current.has(pending)) {
          pendingEditRef.current = null;
          startEditing(pending);
        }
      })
      .catch(() => {});

    return () => {
      disposed = true;
    };
     
  }, [ymapsKey, zonesKey, selectedIndex, restaurantCenter, fitKey, startEditing]);

  // Размонтирование — уничтожаем карту
  useEffect(() => {
    const polygons = polygonsRef.current;
    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      polygons.clear();
      mapRef.current?.destroy();
      mapRef.current = null;
      ymapsRef.current = null;
    };
  }, []);

  // Выбор зоны = режим правки (drag тела/вершин)
  useEffect(() => {
    if (drawingIndexRef.current !== null) return; // рисуем — не перебиваем
    if (selectedIndex === null) {
      if (editingIndexRef.current !== null) finishEditing();
      return;
    }
    if (editingIndexRef.current === selectedIndex) return; // уже правим
    const zone = zonesRef.current[selectedIndex];
    if ((zone?.polygon?.length ?? 0) >= 3) {
      if (!startEditing(selectedIndex)) {
        pendingEditRef.current = selectedIndex; // полигон ещё создаётся
      }
    } else if (editingIndexRef.current !== null) {
      finishEditing();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex, zonesKey]);

  // Свободное рисование (legacy-зоны без полигона)
  useEffect(() => {
    if (drawToken === 0) return;
    const ymaps = ymapsRef.current;
    const map = mapRef.current;
    const index = selectedIndex;
    if (!ymaps || !map || index === null) return;
    if (editingIndexRef.current !== null) finishEditing();
    stopAllEditing();
    onBusyRef.current({ drawing: true, editing: false });
    const old = polygonsRef.current.get(index);
    if (old) {
      map.geoObjects.remove(old);
      polygonsRef.current.delete(index);
    }
    const color = zoneColor(index);
    // Пустая геометрия — иначе редактор не входит в режим рисования
    const polygon = new ymaps.Polygon(
      [],
      { hintContent: zonesRef.current[index]?.name ?? "" },
      {
        strokeColor: color.stroke,
        fillColor: color.stroke,
        fillOpacity: 0.35,
        strokeWidth: 4,
        editorDrawingCursor: "crosshair",
      },
    );
    map.geoObjects.add(polygon);
    polygonsRef.current.set(index, polygon);
    drawingIndexRef.current = index;
    setDblClickZoom(false);
    polygon.editor.events.add("drawingcomplete", () => finishDrawing());
    polygon.editor.startDrawing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawToken]);

  // «Готово» при рисовании
  useEffect(() => {
    if (stopDrawToken === 0) return;
    const index = drawingIndexRef.current;
    if (index === null) return;
    const polygon = polygonsRef.current.get(index);
    try {
      polygon?.editor.stopDrawing();
    } catch {
      // полигон мог завершиться сам — финализация в finishDrawing
    }
    finishDrawing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopDrawToken]);

  // «Готово» при правке
  useEffect(() => {
    if (stopEditToken === 0) return;
    if (editingIndexRef.current !== null) finishEditing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopEditToken]);

  if (!ymapsKey) {
    return (
      <p className="text-sm text-muted">
        Для работы с зонами задайте ключ <code>YANDEX_MAPS_API_KEY</code> в настройках сайта.
        Без ключа зоны работают без карты (выбор гостем из списка).
      </p>
    );
  }
  return <div ref={containerRef} className="h-[60vh] min-h-96 w-full rounded-[var(--radius)] overflow-hidden bg-foreground/5" />;
}
