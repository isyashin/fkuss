import { z } from "zod";

export const preferredChannelSchema = z.enum(["phone", "whatsapp", "telegram"]);
export const preferredChannelInputSchema = preferredChannelSchema.nullable().default(null);
export type PreferredChannel = z.infer<typeof preferredChannelSchema>;
export type GuestChannels = { whatsapp: boolean; telegram: boolean };
export type GuestContactLink = { channel: PreferredChannel; label: string; href: string };

/** Старые настройки сайта не содержат guestContact: оба ручных канала доступны. */
export function visibleGuestChannels(settings: { guestContact?: Partial<GuestChannels> }): GuestChannels {
  return {
    whatsapp: settings.guestContact?.whatsapp !== false,
    telegram: settings.guestContact?.telegram !== false,
  };
}

export function normalizeContactPhone(phone: string): string | null {
  const value = phone.trim();
  if (!/^\+?[\d\s()-]+$/.test(value)) return null;
  const digits = value.replace(/\D/g, "");
  if (!value.startsWith("+") && /^8\d{10}$/.test(digits)) return `7${digits.slice(1)}`;
  if (!value.startsWith("+") && /^9\d{9}$/.test(digits)) return `7${digits}`;
  return /^[1-9]\d{9,14}$/.test(digits) ? digits : null;
}

/** Ни одна ссылка не создаётся при некорректном номере; выбранный канал не подменяется. */
export function contactLinks(phone: string, preferred: PreferredChannel | null, channels: GuestChannels): GuestContactLink[] {
  const digits = normalizeContactPhone(phone);
  if (!digits) return [];
  const phoneLink: GuestContactLink = { channel: "phone", label: "Позвонить", href: `tel:+${digits}` };
  const whatsapp: GuestContactLink = { channel: "whatsapp", label: "Открыть WhatsApp", href: `https://wa.me/${digits}` };
  const telegram: GuestContactLink = { channel: "telegram", label: "Найти в Telegram", href: `https://t.me/+${digits}` };
  if (preferred === "phone") return [phoneLink];
  if (preferred === "whatsapp") return channels.whatsapp ? [whatsapp] : [];
  if (preferred === "telegram") return channels.telegram ? [telegram] : [];
  return [channels.whatsapp ? whatsapp : null, channels.telegram ? telegram : null].filter((link): link is GuestContactLink => link !== null);
}
