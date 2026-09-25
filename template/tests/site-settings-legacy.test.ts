import { describe, expect, it, vi } from "vitest";

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ settings: { findUnique } }) }));

import { getSiteSettings } from "@/lib/site";

describe("legacy site settings", () => {
  it("supplies pricing defaults for an existing database row without changing its other values", async () => {
    const legacy = { delivery: { pickupEnabled: true }, guestContact: { whatsapp: false, telegram: true } };
    findUnique.mockResolvedValueOnce({ value: legacy });

    const settings = await getSiteSettings();

    expect(settings).toMatchObject({
      delivery: legacy.delivery,
      guestContact: legacy.guestContact,
      pricing: { globalMode: "yandex", globalPercent: 0 },
      timezone: "Europe/Moscow",
    });
  });
});
