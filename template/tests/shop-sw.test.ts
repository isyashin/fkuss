import { describe, expect, it } from "vitest";

// Логика — в public/sw-strategy.js (общий файл с public/sw.js).
import "../public/sw-strategy.js";

type StrategyKind = "pass-through" | "network-only" | "network-first" | "swr";

interface ShopSwStrategyApi {
  VERSION: string;
  STATIC_CACHE: string;
  PAGE_CACHE: string;
  ALL_CACHES: string[];
  OFFLINE_URL: string;
  PRECACHE: string[];
  MAX_PAGE_ENTRIES: number;
  canCacheResponse(response: { ok: boolean; type: string; headers: Headers }, publicStatic?: boolean): boolean;
  decideStrategy(input: { url: string; method: string; mode: string }, origin: string): StrategyKind;
}

declare global {
  var ShopSwStrategy: ShopSwStrategyApi | undefined;
}

const S = globalThis.ShopSwStrategy!;
const ORIGIN = "https://site.example";

function decide(url: string, init: { method?: string; mode?: string } = {}): StrategyKind {
  return S.decideStrategy({ url, method: init.method ?? "GET", mode: init.mode ?? "no-cors" }, ORIGIN);
}

describe("shop sw — версионирование кэша", () => {
  it("имена кэшей содержат версию; заглушка прекэшится", () => {
    expect(S.VERSION).toBeTruthy();
    expect(S.STATIC_CACHE).toContain(S.VERSION);
    expect(S.PAGE_CACHE).toContain(S.VERSION);
    expect(S.ALL_CACHES).toEqual([S.STATIC_CACHE, S.PAGE_CACHE]);
    expect(S.PRECACHE).toEqual([S.OFFLINE_URL]);
  });
});

describe("shop sw — мутации и чувствительные маршруты только через сеть", () => {
  it("любой не-GET запрос — network-only", () => {
    expect(decide(`${ORIGIN}/`, { method: "POST" })).toBe("network-only");
    expect(decide(`${ORIGIN}/api/order`, { method: "POST" })).toBe("network-only");
    expect(decide(`${ORIGIN}/api/order`, { method: "PUT" })).toBe("network-only");
    expect(decide(`${ORIGIN}/content-asset/icons/icon-192.png`, { method: "DELETE" })).toBe("network-only");
  });

  it("создание заказа и оплата не кэшируются никогда", () => {
    expect(decide(`${ORIGIN}/api/order`, { method: "POST" })).toBe("network-only");
    expect(decide(`${ORIGIN}/api/payments/webhook/yookassa`, { method: "POST" })).toBe("network-only");
    expect(decide(`${ORIGIN}/api/booking`, { method: "POST" })).toBe("network-only");
    expect(decide(`${ORIGIN}/api/auth/request-code`, { method: "POST" })).toBe("network-only");
    expect(decide(`${ORIGIN}/api/pv`, { method: "POST" })).toBe("network-only");
  });

  it("админка и её API — network-only даже для GET", () => {
    expect(decide(`${ORIGIN}/admin`)).toBe("network-only");
    expect(decide(`${ORIGIN}/admin/orders`)).toBe("network-only");
    expect(decide(`${ORIGIN}/admin/manifest.webmanifest`)).toBe("network-only");
    expect(decide(`${ORIGIN}/api/admin/events`)).toBe("network-only");
  });

  it("чужой origin и сломанные URL — pass-through", () => {
    expect(decide("https://evil.example/")).toBe("pass-through");
    expect(decide("https://evil.example/admin/orders")).toBe("pass-through");
    expect(decide("chrome-extension://abc/page")).toBe("pass-through");
    expect(decide("not-a-url")).toBe("pass-through");
  });
});

describe("shop sw — GET API витрины: network-first (офлайн — последний кэш)", () => {
  it("слоты брони попадают в network-first, а не под префикс /api/booking", () => {
    expect(decide(`${ORIGIN}/api/booking/slots?date=2026-10-13`)).toBe("network-first");
    expect(decide(`${ORIGIN}/api/delivery/slots`)).toBe("network-first");
  });
});

describe("shop sw — документы: network-first, статика: stale-while-revalidate", () => {
  it("навигация по страницам витрины — network-first (свежий HTML после правок в админке)", () => {
    expect(decide(`${ORIGIN}/`, { mode: "navigate" })).toBe("network-first");
    expect(decide(`${ORIGIN}/delivery`, { mode: "navigate" })).toBe("network-first");
    expect(decide(`${ORIGIN}/?promo=1`, { mode: "navigate" })).toBe("network-first");
  });

  it("статика — swr независимо от mode", () => {
    expect(decide(`${ORIGIN}/_next/static/chunks/app.js`)).toBe("swr");
    expect(decide(`${ORIGIN}/_next/static/media/font.woff2`)).toBe("swr");
    expect(decide(`${ORIGIN}/_next/image?url=%2Fcontent-asset%2Fdish.png`)).toBe("swr");
    expect(decide(`${ORIGIN}/content-asset/icons/icon-192.png?v=7`)).toBe("swr");
    expect(decide(`${ORIGIN}/api/site-icon?size=32&v=7`)).toBe("swr");
    expect(decide(`${ORIGIN}/audio/order-site.mp3`)).toBe("swr");
  });

  it("прочие GET (не статика, не документ) не трогаем", () => {
    expect(decide(`${ORIGIN}/manifest.webmanifest`)).toBe("pass-through");
  });
});

describe("shop sw — private documents and address previews", () => {
  it.each(["/account", "/account/orders/own-order", "/order/success?n=42", "/payment/mock?orderId=42", "/api/delivery/zone?address=private-address"])("never caches %s", (path) => {
    expect(decide(`${ORIGIN}${path}`, { mode: "navigate" })).toBe("network-only");
    expect(decide(`${ORIGIN}${path}`)).toBe("network-only");
  });
  it("unknown future documents require an explicit public cache rule", () => {
    expect(decide(`${ORIGIN}/future-private-page`, { mode: "navigate" })).toBe("network-only");
    expect(decide(`${ORIGIN}/p/about`, { mode: "navigate" })).toBe("network-first");
  });
  it("does not retain the v2 cache that could contain private documents", () => {
    expect(S.ALL_CACHES).not.toContain("fkuss-shop-pages-v2");
  });
  it("never stores a personalized public page response", () => {
    expect(S.canCacheResponse({ ok: true, type: "basic", headers: new Headers({ "x-fkuss-cache": "public" }) })).toBe(true);
    expect(S.canCacheResponse({ ok: true, type: "basic", headers: new Headers() })).toBe(false);
    expect(S.canCacheResponse({ ok: true, type: "basic", headers: new Headers() }, true)).toBe(true);
    expect(S.canCacheResponse({ ok: true, type: "basic", headers: new Headers({ "x-fkuss-cache": "private" }) }, true)).toBe(false);
    expect(S.canCacheResponse({ ok: true, type: "basic", headers: new Headers({ "x-fkuss-cache": "private" }) })).toBe(false);
    expect(S.canCacheResponse({ ok: false, type: "basic", headers: new Headers() })).toBe(false);
  });
});
