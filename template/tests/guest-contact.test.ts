import { describe, expect, it } from "vitest";
import { contactLinks, normalizeContactPhone, preferredChannelInputSchema, preferredChannelSchema, visibleGuestChannels } from "@/lib/guest-contact";
import { guestContactSchema } from "@/lib/content-schema";

describe("guest contact preference", () => {
  it("normalizes only plausible international numbers", () => {
    expect(normalizeContactPhone("+7 (903) 555-23-92")).toBe("79035552392");
    expect(normalizeContactPhone("8 903 555-23-92")).toBe("79035552392");
    expect(normalizeContactPhone("9035552392")).toBe("79035552392");
    expect(normalizeContactPhone("+44 20 7946 0958")).toBe("442079460958");
    expect(normalizeContactPhone("12345")).toBeNull();
    expect(normalizeContactPhone("abc+79035552392")).toBeNull();
    expect(normalizeContactPhone("" )).toBeNull();
  });

  it("uses only the guest's chosen channel and never adds message text", () => {
    const channels = { whatsapp: true, telegram: true };
    expect(preferredChannelSchema.parse("telegram")).toBe("telegram");
    expect(preferredChannelInputSchema.parse(undefined)).toBeNull();
    expect(() => preferredChannelSchema.parse("email")).toThrow();
    expect(contactLinks("+7 (903) 555-23-92", "whatsapp", channels).map((link) => link.href)).toEqual(["https://wa.me/79035552392"]);
    expect(contactLinks("+7 (903) 555-23-92", "telegram", channels).map((link) => link.href)).toEqual(["https://t.me/+79035552392"]);
    expect(contactLinks("+7 (903) 555-23-92", "phone", channels).map((link) => link.href)).toEqual(["tel:+79035552392"]);
  });

  it("does not substitute another messenger when the chosen one is hidden", () => {
    expect(contactLinks("+7 (903) 555-23-92", "whatsapp", { whatsapp: false, telegram: true })).toEqual([]);
    expect(contactLinks("bad", "whatsapp", { whatsapp: true, telegram: true })).toEqual([]);
    expect(contactLinks("+7 (903) 555-23-92", null, { whatsapp: true, telegram: true }).map((link) => link.channel)).toEqual(["whatsapp", "telegram"]);
    expect(visibleGuestChannels({})).toEqual({ whatsapp: true, telegram: true });
    expect(guestContactSchema.parse({ whatsapp: false })).toEqual({ whatsapp: false, telegram: true });
  });
});
