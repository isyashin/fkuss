import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import type { ContentSettings } from "@/lib/content-schema";
import source from "../content/settings.json";
import { applyAdminSettings } from "@/lib/admin-settings-service";

function fakeDatabase() {
  const rows = new Map<string, Record<string, unknown>>([
    ["theme", { preset: "warm", accent: "#a65335", fontHeading: "Georgia", background: { image: "images/background/old.webp" } }],
    ["settings", { ...source, banquets: { enabled: true, title: "Сохранённые банкеты" }, sync: { enabled: true, placeSlug: "current", intervalMinutes: 60 } }],
  ]);
  const dish = { id: "dish-1", price: 1000, yandexPrice: 1000, manualPrice: null, priceMode: "inherit", coefficientPercent: null };
  const modifier = { id: "modifier-1", price: 200, yandexPrice: 200, manualPrice: null };
  let transactions = 0;
  const tx = {
    settings: {
      findUnique: async ({ where }: { where: { key: string } }) => rows.has(where.key) ? { value: rows.get(where.key) } : null,
      upsert: async ({ where, create }: { where: { key: string }; create: { value: Record<string, unknown> } }) => { rows.set(where.key, create.value); },
    },
    dish: { findMany: async () => [dish], update: async ({ data }: { data: { price: number } }) => { dish.price = data.price; } },
    modifier: { findMany: async () => [modifier], update: async ({ data }: { data: { price: number } }) => { modifier.price = data.price; } },
  };
  const prisma = { $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => { transactions++; return callback(tx); } } as unknown as PrismaClient;
  return { prisma, rows, dish, modifier, transactions: () => transactions };
}

const input = () => ({
  settings: { ...structuredClone(source), guestContact: { whatsapp: false, telegram: true } } as ContentSettings,
  theme: { preset: "minimal", accent: "#b56544" },
  background: { enabled: false, image: "", position: "center" as const, dimPercent: 40, disableOnMobile: true },
  pricing: { globalMode: "coefficient" as const, globalPercent: 10 },
});

describe("atomic admin settings save", () => {
  it("saves site settings and theme, then recalculates dish and modifier prices in one transaction", async () => {
    const db = fakeDatabase();
    const result = await applyAdminSettings(db.prisma, input());
    expect(db.transactions()).toBe(1);
    expect(db.rows.get("settings")?.pricing).toEqual({ globalMode: "coefficient", globalPercent: 10 });
    expect(db.rows.get("settings")?.guestContact).toEqual({ whatsapp: false, telegram: true });
    expect(db.rows.get("settings")?.banquets).toEqual({ enabled: true, title: "Сохранённые банкеты" });
    expect(db.rows.get("settings")?.sync).toEqual({ enabled: true, placeSlug: "current", intervalMinutes: 60 });
    expect(db.rows.get("theme")).toMatchObject({ preset: "minimal", accent: "#b56544", fontHeading: "Georgia", background: { image: "" } });
    expect(db.dish.price).toBe(1100);
    expect(db.modifier.price).toBe(220);
    expect(result.previousBackgroundImage).toBe("images/background/old.webp");
  });

  it("rejects invalid loyalty values before opening a transaction", async () => {
    const db = fakeDatabase();
    const invalid = input();
    invalid.settings.loyalty.cashbackPercent = 101;
    await expect(applyAdminSettings(db.prisma, invalid)).rejects.toThrow();
    expect(db.transactions()).toBe(0);
  });
});
