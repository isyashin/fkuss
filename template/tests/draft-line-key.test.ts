import { describe, expect, it } from "vitest";
import { draftLineKey } from "@/lib/order/draft-line-key";

describe("draftLineKey (F02: ключи черновика вне secure context)", () => {
  it("возвращает 24-символьный hex-ключ", () => {
    expect(draftLineKey()).toMatch(/^[0-9a-f]{24}$/);
  });

  it("ключи уникальны", () => {
    const keys = new Set(Array.from({ length: 200 }, () => draftLineKey()));
    expect(keys.size).toBe(200);
  });

  it("работает, когда crypto.randomUUID недоступен (HTTP-стенд)", () => {
    const original = crypto.randomUUID;
    // Вне secure context randomUUID отсутствует — эмулируем отсутствие.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (crypto as any).randomUUID;
    try {
      expect(draftLineKey()).toMatch(/^[0-9a-f]{24}$/);
    } finally {
      Object.defineProperty(crypto, "randomUUID", { value: original, configurable: true });
    }
  });
});
