import { z } from "zod";
import { canonicalToPublicUrl } from "./print-materials";

export const MAGNET_TEMPLATE = "food-collage-50x70-v1" as const;
export const MAGNET_FONTS = [
  { id: "roboto-condensed", name: "Roboto Condensed", hint: "Узкий" },
  { id: "oswald", name: "Oswald", hint: "Плакатный" },
  { id: "pt-sans", name: "PT Sans", hint: "Классический" },
] as const;
const text = (max: number) => z.string().trim().max(max).refine(s => !/[\u0000-\u0008\u000b-\u001f]/.test(s), "Недопустимый символ");
export const magnetInputSchema = z.object({
  template: z.literal(MAGNET_TEMPLATE),
  revision: z.number().int().nonnegative(),
  headline: text(72).min(1, "Добавьте название"),
  lead: text(48),
  accent: text(12),
  tail: text(32),
  font: z.enum(["roboto-condensed", "oswald", "pt-sans"]),
  photos: z.array(z.object({ dishId: z.string().min(1).max(200), snapshot: z.string().regex(/^[a-f0-9]{64}$/).optional() }).nullable()).length(4),
});
export type MagnetInput = z.infer<typeof magnetInputSchema>;
export interface MagnetPhoto { dishId: string; name: string; snapshot: string; width: number; height: number; dpi: number }
export interface MagnetDraft extends Omit<MagnetInput, "photos"> { photos: (MagnetPhoto | null)[] }
export interface MagnetDish { id: string; name: string; image: string; category: string; menu: string }
export interface MagnetEditorData { draft: MagnetDraft; dishes: MagnetDish[]; qrUrl: string }
export const MAGNET_SPEC = { width: 50, height: 70, bleed: 3, pageWidth: 56, pageHeight: 76, dpi: 600, pngWidth: 1181, pngHeight: 1654 } as const;

/** No client URL, Host header or campaign parameter ever participates in QR selection. */
export function magnetQrUrl(canonical: string): string {
  const url = new URL(canonicalToPublicUrl(canonical));
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Проверьте основной домен ресторана");
  }
  return url.toString();
}
export function defaultMagnet(name: string): MagnetDraft {
  return { template: MAGNET_TEMPLATE, revision: 0, headline: name, lead: "Заказывайте на нашем сайте", accent: "", tail: "", font: "roboto-condensed", photos: [null, null, null, null] };
}
export function magnetInput(draft: MagnetDraft): MagnetInput {
  return { ...draft, photos: draft.photos.map(p => p ? { dishId: p.dishId, snapshot: p.snapshot } : null) };
}
export function magnetFileStem(slug: string): string { return `${slug.replace(/[^a-zA-Z0-9_-]/g, "-") || "restaurant"}-magnet-50x70mm`; }
