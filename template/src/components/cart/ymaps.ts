/**
 * Ленивая загрузка JS API Яндекс Карт (2.1) — один синглтон на страницу.
 * Ключ публичный: JS API работает в браузере и виден посетителям
 * (ограничивается referer/IP в кабинете Яндекса).
 * Типы — минимальная поверхность, которую используем (полного пакета нет).
 */

export interface YSuggestItem {
  value?: string;
}

export interface YMapEvent {
  get: (key: string) => unknown;
}

export interface YSuggestView {
  events: { add: (name: string, cb: (e: YMapEvent) => void) => void };
  destroy: () => void;
}

export interface YEventBus {
  add: (name: string, cb: (e?: YMapEvent) => void) => void;
  remove: (name: string, cb: (e?: YMapEvent) => void) => void;
}

export interface YGeoObject {
  geometry: { setCoordinates: (coords: [number, number]) => void };
}

export interface YPolygonGeometry {
  getCoordinates: () => number[][][];
  setCoordinates: (coords: number[][][]) => void;
  events: YEventBus;
}

export interface YPolygonEditor {
  startEditing: () => void;
  stopEditing: () => void;
  startDrawing: () => void;
  stopDrawing: () => void;
  events: YEventBus;
}

export interface YPolygon {
  geometry: YPolygonGeometry;
  editor: YPolygonEditor;
  properties: { set: (key: string, value: unknown) => void };
  options: { set: (key: string, value: unknown) => void };
  events: YEventBus;
}

export interface YMap {
  geoObjects: {
    add: (o: unknown) => void;
    remove: (o: unknown) => void;
    getBounds: () => number[][] | null;
  };
  behaviors: {
    disable: (name: string) => void;
    enable: (name: string) => void;
  };
  getCenter: () => [number, number];
  setBounds: (bounds: number[][], opts?: { zoomMargin?: number; checkZoomRange?: boolean }) => void;
  setCenter: (center: [number, number], zoom?: number) => void;
  destroy: () => void;
}

export interface YMapsApi {
  Map: new (
    el: HTMLElement,
    state: { center: [number, number]; zoom: number },
    options?: Record<string, unknown>,
  ) => YMap;
  Polygon: new (
    coordinates: number[][][],
    properties?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ) => YPolygon;
  Placemark: new (
    coordinates: [number, number],
    properties?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ) => YGeoObject;
  SuggestView: new (el: HTMLInputElement, options?: Record<string, unknown>) => YSuggestView;
}

let current: { key: string; promise: Promise<YMapsApi> } | null = null;

export function loadYmaps(apiKey: string): Promise<YMapsApi> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("ymaps доступен только в браузере"));
  }
  if (current && current.key === apiKey) return current.promise;

  const promise = new Promise<YMapsApi>((resolve, reject) => {
    const callbackName = "__ymapsOnload";
    const errorName = "__ymapsOnerror";
    const previousCallback = (window as unknown as Record<string, unknown>)[callbackName];

    (window as unknown as Record<string, unknown>)[callbackName] = () => {
      if (previousCallback === undefined) {
        delete (window as unknown as Record<string, unknown>)[callbackName];
      } else {
        (window as unknown as Record<string, unknown>)[callbackName] = previousCallback;
      }
      const api = (window as unknown as { ymaps?: YMapsApi }).ymaps;
      if (api) resolve(api);
      else reject(new Error("ymaps не загрузился"));
    };
    (window as unknown as Record<string, unknown>)[errorName] = () => {
      reject(new Error("ymaps: ошибка загрузки"));
    };

    const script = document.createElement("script");
    script.src =
      `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(apiKey)}` +
      `&lang=ru_RU&onload=${callbackName}&onerror=${errorName}`;
    script.async = true;
    document.head.appendChild(script);
  });

  current = { key: apiKey, promise };
  return promise;
}
