import { describe, expect, it } from "vitest";
import { siteInputSchema } from "../scripts/schemas/site-input";

const input = {
  identity: { name: "QA", slug: "qa-cafe", domain: "https://qa-cafe.fkuss.test" },
  source: { kind: "yandex-eda", url: "https://eda.yandex.ru/r/qa" },
  contacts: { phone: "+7 (999) 123-45-67", hours: [{ days: "пн–вс", from: "10:00", to: "22:00" }] },
};

describe("pipeline manifest", () => {
  it.each(["not-a-url", "https://owner:pass@qa.fkuss.test", "https://qa.fkuss.test/admin", "http://qa.fkuss.test", "https://qa.fkuss.test/?x=1"])("rejects a noncanonical origin: %s", (domain) => {
    expect(siteInputSchema.safeParse({ ...input, identity: { ...input.identity, domain } }).success).toBe(false);
  });

  it("recognizes the Yandex hostname rather than a substring in an unrelated URL", () => {
    expect(siteInputSchema.safeParse({ ...input, source: { kind: "yandex-eda", url: "https://unrelated.test/?eda.yandex.ru" } }).success).toBe(false);
  });

  it("rejects impossible hours and invalid contact numbers", () => {
    expect(siteInputSchema.safeParse({ ...input, contacts: { ...input.contacts, phone: "hello" } }).success).toBe(false);
    expect(siteInputSchema.safeParse({ ...input, contacts: { ...input.contacts, hours: [{ days: "пн–вс", from: "25:00", to: "22:00" }] } }).success).toBe(false);
  });

  it.each([-1, 1.5, 2_147_483_648])("rejects an invalid initial platform credit: %s", (initialKopecks) => {
    expect(siteInputSchema.safeParse({ ...input, platform: { ownerEmail: "owner@fkuss.test", tariffId: "standard", initialKopecks } }).success).toBe(false);
  });

  it("keeps an explicitly reviewed platform owner, tariff and credit", () => {
    const platform = { ownerEmail: "owner@fkuss.test", tariffId: "standard", initialKopecks: 12345 };
    expect(siteInputSchema.parse({ ...input, platform }).platform).toEqual(platform);
  });
});
