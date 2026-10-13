import { describe, expect, it, vi } from "vitest";

// Issue #47: включение раздела банкетов должно публиковать /banquets,
// даже если залов ещё нет (заглушка вместо 404).

const notFoundMocks = vi.hoisted(() => ({ notFound: vi.fn() }));

vi.mock("next/navigation", () => ({
  notFound: notFoundMocks.notFound,
}));

const siteMocks = vi.hoisted(() => ({
  getSiteSettings: vi.fn(),
  contentAssetUrl: vi.fn((src: string) => src),
}));

vi.mock("@/lib/site", () => ({
  getSiteSettings: siteMocks.getSiteSettings,
  contentAssetUrl: siteMocks.contentAssetUrl,
}));

const dbMocks = vi.hoisted(() => ({
  getPrisma: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getPrisma: dbMocks.getPrisma,
}));

import BanquetsPage from "@/app/banquets/page";

function prismaWithHalls(halls: unknown[]) {
  return {
    banquetHall: {
      findMany: vi.fn().mockResolvedValue(halls),
    },
  };
}

describe("BanquetsPage (issue #47)", () => {
  it("enabled=true без залов → страница рендерится (без notFound), заглушка «Залы скоро появятся»", async () => {
    notFoundMocks.notFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    siteMocks.getSiteSettings.mockResolvedValue({ banquets: { enabled: true } });
    dbMocks.getPrisma.mockReturnValue(prismaWithHalls([]));

    const jsx = await BanquetsPage();

    expect(notFoundMocks.notFound).not.toHaveBeenCalled();
    const html = JSON.stringify(jsx);
    expect(html).toContain("Залы скоро появятся");
  });

  it("enabled=false → notFound()", async () => {
    notFoundMocks.notFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    siteMocks.getSiteSettings.mockResolvedValue({ banquets: { enabled: false } });

    await expect(BanquetsPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFoundMocks.notFound).toHaveBeenCalled();
  });

  it("enabled=true с залами → рендерятся залы", async () => {
    notFoundMocks.notFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
    siteMocks.getSiteSettings.mockResolvedValue({ banquets: { enabled: true } });
    dbMocks.getPrisma.mockReturnValue(
      prismaWithHalls([{ id: "h1", name: "Зал Панорама", capacity: "до 40", description: "", image: "", images: [] }]),
    );

    const jsx = await BanquetsPage();

    expect(notFoundMocks.notFound).not.toHaveBeenCalled();
    expect(JSON.stringify(jsx)).toContain("Зал Панорама");
  });
});
