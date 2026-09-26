import type { PrismaClient } from "@/generated/prisma/client";
import type { ContentSettings } from "./content-schema";
import { validateBackgroundMutation, validateSettingsMutation, validateThemeMutation } from "./admin-settings-validation";
import { recomputePrices } from "./order/recompute";

export type AdminSettingsInput = {
  settings: ContentSettings;
  theme: { preset: string; accent: string };
  background: { enabled: boolean; image: string; position: "center" | "top" | "bottom"; dimPercent: number; disableOnMobile: boolean };
  pricing: { globalMode: string; globalPercent: number };
};

/** Настройки и рассчитанные цены меняются одной транзакцией. */
export async function applyAdminSettings(prisma: PrismaClient, input: AdminSettingsInput): Promise<{ previousBackgroundImage: string }> {
  const settings = validateSettingsMutation({ ...input.settings, pricing: input.pricing });
  const theme = validateThemeMutation(input.theme);
  const background = validateBackgroundMutation(input.background);

  return prisma.$transaction(async (tx) => {
    const [settingsRow, themeRow] = await Promise.all([
      tx.settings.findUnique({ where: { key: "settings" } }),
      tx.settings.findUnique({ where: { key: "theme" } }),
    ]);
    const currentSettings = (settingsRow?.value ?? settings) as Record<string, unknown>;
    const nextSettings = {
      ...currentSettings,
      delivery: settings.delivery,
      channels: settings.channels,
      guestContact: settings.guestContact,
      payment: settings.payment,
      loyalty: settings.loyalty,
      pricing: settings.pricing,
      booking: settings.booking,
      timezone: settings.timezone,
    };
    const currentTheme = (themeRow?.value ?? {}) as Record<string, unknown>;
    const previousBackgroundImage = (currentTheme.background as { image?: unknown } | undefined)?.image;
    const nextTheme = { ...currentTheme, ...theme, background };

    await tx.settings.upsert({
      where: { key: "settings" },
      create: { key: "settings", value: JSON.parse(JSON.stringify(nextSettings)) },
      update: { value: JSON.parse(JSON.stringify(nextSettings)) },
    });
    await tx.settings.upsert({
      where: { key: "theme" },
      create: { key: "theme", value: JSON.parse(JSON.stringify(nextTheme)) },
      update: { value: JSON.parse(JSON.stringify(nextTheme)) },
    });
    await recomputePrices(tx);
    return { previousBackgroundImage: typeof previousBackgroundImage === "string" ? previousBackgroundImage : "" };
  }, { timeout: 30_000 });
}
