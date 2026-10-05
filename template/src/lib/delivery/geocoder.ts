/**
 * HTTP API Геокодера Яндекса (geocode-maps.yandex.ru/v1).
 * Бесплатный пакет: 1000 запросов/сутки на ключ, поэтому кэш LRU (лицензия
 * разрешает временное кэширование результатов до 30 дней).
 * Point.pos в ответе — "долгота широта" через пробел.
 */

export interface GeocodedPoint {
  lat: number;
  lng: number;
  formatted: string;
}

export type GeocodeError =
  | { kind: "not-configured" }
  | { kind: "invalid-key" }
  | { kind: "not-found" }
  | { kind: "unavailable" };

export type GeocodeResult =
  | { ok: true; point: GeocodedPoint }
  | { ok: false; error: GeocodeError };

export interface Geocoder {
  geocode(address: string): Promise<GeocodeResult>;
}

interface YandexGeocodeResponse {
  response?: {
    GeoObjectCollection?: {
      featureMember?: Array<{
        GeoObject?: {
          metaDataProperty?: { GeocoderMetaData?: { text?: string } };
          Point?: { pos?: string };
        };
      }>;
    };
  };
}

interface CacheEntry {
  point: GeocodedPoint;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 500;
const TIMEOUT_MS = 5000;

export function createGeocoder(deps: {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  ttlMs?: number;
  maxEntries?: number;
}): Geocoder {
  const {
    apiKey = "",
    fetchImpl = fetch,
    now = Date.now,
    ttlMs = DEFAULT_TTL_MS,
    maxEntries = DEFAULT_MAX_ENTRIES,
  } = deps;
  const cache = new Map<string, CacheEntry>();

  return {
    async geocode(address: string): Promise<GeocodeResult> {
      if (!apiKey) return { ok: false, error: { kind: "not-configured" } };

      const key = address.trim().toLowerCase().replace(/\s+/g, " ");
      if (!key) return { ok: false, error: { kind: "not-found" } };

      const hit = cache.get(key);
      if (hit) {
        if (hit.expiresAt > now()) return { ok: true, point: hit.point };
        cache.delete(key);
      }

      let response: Response;
      try {
        const url =
          `https://geocode-maps.yandex.ru/v1/?apikey=${encodeURIComponent(apiKey)}` +
          `&geocode=${encodeURIComponent(address.trim())}&format=json&results=1&lang=ru_RU`;
        response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      } catch {
        return { ok: false, error: { kind: "unavailable" } };
      }

      if (response.status === 403) return { ok: false, error: { kind: "invalid-key" } };
      if (!response.ok) return { ok: false, error: { kind: "unavailable" } };

      let payload: YandexGeocodeResponse;
      try {
        payload = (await response.json()) as YandexGeocodeResponse;
      } catch {
        return { ok: false, error: { kind: "unavailable" } };
      }

      const geoObject = payload.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject;
      const pos = geoObject?.Point?.pos;
      if (!pos) return { ok: false, error: { kind: "not-found" } };

      const [lngStr, latStr] = pos.trim().split(/\s+/);
      const lng = Number(lngStr);
      const lat = Number(latStr);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return { ok: false, error: { kind: "unavailable" } };
      }

      const point: GeocodedPoint = {
        lat,
        lng,
        formatted: geoObject?.metaDataProperty?.GeocoderMetaData?.text ?? address.trim(),
      };

      if (cache.size >= maxEntries) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(key, { point, expiresAt: now() + ttlMs });
      return { ok: true, point };
    },
  };
}

// Singleton для кода приложения: ключ из env (серверный — в браузер не отдаём).
let singleton: Geocoder | null = null;

export function geocodeAddress(address: string): Promise<GeocodeResult> {
  if (!singleton) {
    singleton = createGeocoder({
      apiKey: process.env.YANDEX_GEOCODER_API_KEY ?? process.env.YANDEX_MAPS_API_KEY ?? "",
    });
  }
  return singleton.geocode(address);
}

export function __resetGeocoderForTests(): void {
  singleton = null;
}
