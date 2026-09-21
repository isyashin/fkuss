import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultPrintMaterial } from "@/lib/print-materials";

const mocks = vi.hoisted(() => ({
  isAdmin: vi.fn(),
  getSiteRestaurant: vi.fn(),
  getSiteSettings: vi.fn(),
  exportPrintMaterial: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({ isAdmin: mocks.isAdmin }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: () => true }));
vi.mock("@/lib/site", () => ({
  getSiteRestaurant: mocks.getSiteRestaurant,
  getSiteSettings: mocks.getSiteSettings,
}));
vi.mock("@/lib/print-materials-server", () => ({
  exportPrintMaterial: mocks.exportPrintMaterial,
}));

import { POST } from "@/app/api/admin/print-materials/export/route";

describe("print materials export route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isAdmin.mockResolvedValue(true);
    mocks.getSiteRestaurant.mockResolvedValue({
      slug: "bistro",
      name: "Бистро",
      phone: "+7 999 000-00-00",
      address: "ул. Тестовая, 1",
      logo: "",
    });
    mocks.getSiteSettings.mockResolvedValue({ domains: { canonical: "bistro.example.ru" } });
    mocks.exportPrintMaterial.mockResolvedValue({
      body: new Uint8Array([1, 2, 3]),
      contentType: "image/png",
      extension: "png",
    });
  });

  it("rejects an oversized body before starting a render", async () => {
    const request = new Request("http://localhost/api/admin/print-materials/export", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "20000" },
      body: "{}",
    });

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(mocks.exportPrintMaterial).not.toHaveBeenCalled();
  });

  it("overrides a client URL with the restaurant canonical before rendering", async () => {
    const design = {
      ...createDefaultPrintMaterial("card", { canonical: "bistro.example.ru", accent: "#a33a24" }),
      qrUrl: "https://example-attacker.test/phishing",
    };
    const request = new Request("http://localhost/api/admin/print-materials/export", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "10.0.0.8" },
      body: JSON.stringify({ design, format: "png" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mocks.exportPrintMaterial).toHaveBeenCalledWith(
      expect.objectContaining({
        design: expect.objectContaining({ qrUrl: "https://bistro.example.ru" }),
      }),
    );
  });
});
