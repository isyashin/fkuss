import { describe, it, expect, vi } from "vitest";
import { createGeocoder, geocodeAddress, __resetGeocoderForTests } from "@/lib/delivery/geocoder";

// Ответ API Геокодера: Point.pos — "долгота широта" через пробел
function yandexResponse(text: string, lon: number, lat: number) {
  return {
    response: {
      GeoObjectCollection: {
        featureMember: [
          {
            GeoObject: {
              metaDataProperty: { GeocoderMetaData: { text } },
              Point: { pos: `${lon} ${lat}` },
            },
          },
        ],
      },
    },
  };
}

function mockFetchJson(payload: unknown, status = 200) {
  return vi.fn(async () => new Response(JSON.stringify(payload), { status })) as unknown as typeof fetch;
}

const KEY = "test-geocoder-key";

describe("createGeocoder", () => {
  it("парсит координаты: pos = 'долгота широта'", async () => {
    const fetchImpl = mockFetchJson(yandexResponse("Россия, Москва, Красная площадь", 37.62, 55.75));
    const g = createGeocoder({ apiKey: KEY, fetchImpl });
    const r = await g.geocode("Москва, Красная площадь");
    expect(r).toEqual({
      ok: true,
      point: { lat: 55.75, lng: 37.62, formatted: "Россия, Москва, Красная площадь" },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("подставляет ключ и адрес в URL", async () => {
    const fetchImpl = mockFetchJson(yandexResponse("x", 37.6, 55.7));
    const g = createGeocoder({ apiKey: KEY, fetchImpl });
    await g.geocode("Москва, Тверская 1");
    const url = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain(`apikey=${KEY}`);
    expect(url).toContain("geocode=");
    expect(url).toContain("format=json");
    expect(url).toContain("geocode-maps.yandex.ru/v1/");
  });

  it("пустая выдача — not-found", async () => {
    const fetchImpl = mockFetchJson({ response: { GeoObjectCollection: { featureMember: [] } } });
    const g = createGeocoder({ apiKey: KEY, fetchImpl });
    const r = await g.geocode("Нигде-нибудь");
    expect(r).toEqual({ ok: false, error: { kind: "not-found" } });
  });

  it("403 — invalid-key", async () => {
    const fetchImpl = mockFetchJson({ message: "Invalid api key" }, 403);
    const g = createGeocoder({ apiKey: KEY, fetchImpl });
    const r = await g.geocode("Москва");
    expect(r).toEqual({ ok: false, error: { kind: "invalid-key" } });
  });

  it("прочий не-200 и сетевые сбои — unavailable", async () => {
    const g1 = createGeocoder({ apiKey: KEY, fetchImpl: mockFetchJson({}, 500) });
    expect(await g1.geocode("Москва")).toEqual({ ok: false, error: { kind: "unavailable" } });

    const failing = vi.fn(async () => {
      throw new Error("connection reset");
    }) as unknown as typeof fetch;
    const g2 = createGeocoder({ apiKey: KEY, fetchImpl: failing });
    expect(await g2.geocode("Москва")).toEqual({ ok: false, error: { kind: "unavailable" } });
  });

  it("битый JSON — unavailable", async () => {
    const fetchImpl = vi.fn(async () => new Response("not json", { status: 200 })) as unknown as typeof fetch;
    const g = createGeocoder({ apiKey: KEY, fetchImpl });
    expect(await g.geocode("Москва")).toEqual({ ok: false, error: { kind: "unavailable" } });
  });

  it("без ключа — not-configured, запросов нет", async () => {
    const fetchImpl = mockFetchJson(yandexResponse("x", 37.6, 55.7));
    const g = createGeocoder({ apiKey: "", fetchImpl });
    expect(await g.geocode("Москва")).toEqual({ ok: false, error: { kind: "not-configured" } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("кэширует успешный результат: повторный тот же адрес — без запроса", async () => {
    const fetchImpl = mockFetchJson(yandexResponse("Москва", 37.6, 55.7));
    const g = createGeocoder({ apiKey: KEY, fetchImpl, now: () => 1_000_000 });
    await g.geocode("Москва, Тверская 1");
    await g.geocode("  москва, тверская 1  "); // регистр/пробелы не важны
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("не кэширует ошибки", async () => {
    const fetchImpl = mockFetchJson({ response: { GeoObjectCollection: { featureMember: [] } } });
    const g = createGeocoder({ apiKey: KEY, fetchImpl });
    await g.geocode("Нигде");
    await g.geocode("Нигде");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("после TTL кэш протухает", async () => {
    let now = 0;
    const fetchImpl = mockFetchJson(yandexResponse("Москва", 37.6, 55.7));
    const g = createGeocoder({ apiKey: KEY, fetchImpl, now: () => now, ttlMs: 1000 });
    await g.geocode("Москва");
    now = 999;
    await g.geocode("Москва");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    now = 1001;
    await g.geocode("Москва");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("LRU: старые записи вытесняются по maxEntries", async () => {
    const fetchImpl = mockFetchJson(yandexResponse("Москва", 37.6, 55.7));
    const g = createGeocoder({ apiKey: KEY, fetchImpl, now: () => 0, maxEntries: 2 });
    await g.geocode("Адрес 1");
    await g.geocode("Адрес 2");
    await g.geocode("Адрес 3"); // вытеснит "Адрес 1"
    await g.geocode("Адрес 2"); // в кэше
    await g.geocode("Адрес 1"); // вытеснен — новый запрос
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
});

describe("geocodeAddress (singleton из env)", () => {
  it("без YANDEX_GEOCODER_API_KEY — not-configured", async () => {
    delete process.env.YANDEX_GEOCODER_API_KEY;
    delete process.env.YANDEX_MAPS_API_KEY;
    __resetGeocoderForTests();
    expect(await geocodeAddress("Москва")).toEqual({ ok: false, error: { kind: "not-configured" } });
  });
});
