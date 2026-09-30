/** Изоморфный модуль (без импортов серверных зависимостей — его тянут
 *  клиентские карточки админки). Чтение настроек на сервере:
 *  normalizeGuestCabinet(await getSiteSettings()). */
import type { ContentSettings } from "./content-schema";

export type GuestCabinetSettings = ContentSettings["guestCabinet"];

export const GUEST_CABINET_DEFAULTS: GuestCabinetSettings = {
  enabled: false,
  authMode: "screen",
  smtpUrl: "",
  smtpFrom: "",
};

/** Старые записи настроек без блока guestCabinet → кабинет выключен. */
export function normalizeGuestCabinet(
  settings: Pick<ContentSettings, "guestCabinet"> | null | undefined,
): GuestCabinetSettings {
  return { ...GUEST_CABINET_DEFAULTS, ...(settings?.guestCabinet ?? {}) };
}

export function isGuestCabinetEnabled(
  settings: Pick<ContentSettings, "guestCabinet"> | null | undefined,
): boolean {
  return normalizeGuestCabinet(settings).enabled;
}

/** SMTP кабинета: настройки сайта, при пустых — env сайта (dev-фолбэк). */
export function getSmtpConfig(cabinet: GuestCabinetSettings): { url: string; from: string } {
  return {
    url: cabinet.smtpUrl.trim() || process.env.SMTP_URL || "",
    from: cabinet.smtpFrom.trim() || process.env.SMTP_FROM || "noreply@example.ru",
  };
}

/** Деньги: списание бонусов допустимо только при включённом кабинете. */
export function assertBonusSpendAllowed(cabinetEnabled: boolean, bonusSpend: number): void {
  if (!cabinetEnabled && bonusSpend > 0) {
    throw new Error("Бонусы недоступны: личный кабинет отключён");
  }
}
