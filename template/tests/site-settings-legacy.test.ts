import { describe, expect, it, vi } from "vitest";

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ settings: { findUnique } }) }));

import { getSiteSettings } from "@/lib/site";

describe("legacy site settings", () => {
  it.each([undefined,{cashbackPercent:7,maxSpendPercent:25},{enabled:false,cashbackPercent:7,maxSpendPercent:25},{enabled:true,cashbackPercent:7,maxSpendPercent:25}])("нормализует выключатель в прежней строке БД без изменения остальных настроек",async loyalty=>{
    const legacy={delivery:{pickupEnabled:true},loyalty};findUnique.mockResolvedValueOnce({value:legacy});const settings=await getSiteSettings();expect(settings.loyalty).toEqual({enabled:loyalty?.enabled===true,cashbackPercent:loyalty?.cashbackPercent??5,maxSpendPercent:loyalty?.maxSpendPercent??20});expect(settings.delivery.pickupEnabled).toBe(true);
  });

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
