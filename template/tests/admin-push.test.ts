import { describe, expect, it } from "vitest";
import { buildPushTarget, isPushConfigured, pushBackoffMs, pushErrorCode } from "@/lib/admin-push";

describe("push backoff", () => {
  it("удваивает паузу от базовых 30 с с потолком 30 минут", () => {
    expect(pushBackoffMs(1)).toBe(30_000);
    expect(pushBackoffMs(2)).toBe(60_000);
    expect(pushBackoffMs(3)).toBe(120_000);
    expect(pushBackoffMs(10)).toBe(30 * 60_000);
    expect(pushBackoffMs(20)).toBe(30 * 60_000);
  });
});

describe("push target из проверенного kind + reference", () => {
  it("строит админский путь для заказа и брони", () => {
    expect(buildPushTarget("order", "clx123_ABC")).toBe("/admin?selected=clx123_ABC");
    expect(buildPushTarget("booking", "clx456-DEF")).toBe("/admin/bookings?selected=clx456-DEF");
  });

  it("отклоняет чужой kind и подозрительный reference", () => {
    expect(buildPushTarget("other" as never, "clx1")).toBeNull();
    expect(buildPushTarget("order", "https://evil.example")).toBeNull();
    expect(buildPushTarget("order", "../admin")).toBeNull();
    expect(buildPushTarget("order", "a".repeat(101))).toBeNull();
    expect(buildPushTarget("order", "")).toBeNull();
  });
});

describe("push configuration", () => {
  it("включён только когда задана пара ключей; subject имеет безопасный дефолт", () => {
    expect(isPushConfigured({ VAPID_PUBLIC_KEY: "p", VAPID_PRIVATE_KEY: "s" })).toBe(true);
    expect(isPushConfigured({ VAPID_PUBLIC_KEY: "p", VAPID_PRIVATE_KEY: "s", VAPID_SUBJECT: "mailto:x@y.z" })).toBe(true);
    expect(isPushConfigured({ VAPID_PUBLIC_KEY: "", VAPID_PRIVATE_KEY: "s" })).toBe(false);
    expect(isPushConfigured({ VAPID_PUBLIC_KEY: "p", VAPID_PRIVATE_KEY: "" })).toBe(false);
    expect(isPushConfigured({})).toBe(false);
  });
});

describe("коды ошибок отправки без утечки деталей", () => {
  it("мапит статусы провайдера на безопасные коды", () => {
    expect(pushErrorCode({ statusCode: 404 })).toBe("gone");
    expect(pushErrorCode({ statusCode: 410 })).toBe("gone");
    expect(pushErrorCode({ statusCode: 500 })).toBe("server");
    expect(pushErrorCode({ statusCode: 502 })).toBe("server");
    expect(pushErrorCode({ code: "ETIMEDOUT" })).toBe("timeout");
    expect(pushErrorCode({})).toBe("network");
    expect(pushErrorCode(new Error("boom"))).toBe("network");
  });
});
