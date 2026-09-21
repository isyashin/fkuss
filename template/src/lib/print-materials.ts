import { z } from "zod";

const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Нужен цвет в формате #RRGGBB");

const httpUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .url("Укажите полный адрес сайта")
  .refine((value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === "https:" || protocol === "http:";
    } catch {
      return false;
    }
  }, "Разрешены только http- и https-ссылки");

export const printMaterialKindSchema = z.enum(["card", "magnet"]);
export const printMaterialStyleSchema = z.enum(["accent", "minimal", "contrast"]);

export const printMaterialDesignSchema = z.object({
  kind: printMaterialKindSchema,
  style: printMaterialStyleSchema,
  headline: z.string().trim().min(1, "Добавьте заголовок").max(72),
  subheadline: z.string().trim().max(160),
  offer: z.string().trim().max(90),
  qrUrl: httpUrlSchema,
  campaign: z
    .string()
    .trim()
    .max(64)
    .regex(/^[a-zA-Z0-9_-]*$/, "Используйте латинские буквы, цифры, - и _"),
  backgroundColor: hexColorSchema,
  textColor: hexColorSchema,
  accentColor: hexColorSchema,
  showLogo: z.boolean(),
  showPhone: z.boolean(),
  showAddress: z.boolean(),
});

export type PrintMaterialKind = z.infer<typeof printMaterialKindSchema>;
export type PrintMaterialStyle = z.infer<typeof printMaterialStyleSchema>;
export type PrintMaterialDesign = z.infer<typeof printMaterialDesignSchema>;
export type PrintExportFormat = "svg" | "png" | "pdf";

export interface PrintMaterialsSettings {
  card: PrintMaterialDesign;
  magnet: PrintMaterialDesign;
}

export interface PrintBrand {
  name: string;
  phone: string;
  address: string;
  logoUrl: string;
}

export interface PrintMaterialSpec {
  kind: PrintMaterialKind;
  label: string;
  trimWidthMm: number;
  trimHeightMm: number;
  bleedMm: number;
  safeMm: number;
  pageWidthMm: number;
  pageHeightMm: number;
  pngWidthPx: number;
  pngHeightPx: number;
}

const DPI = 300;

function mmToPx(mm: number): number {
  return Math.round((mm / 25.4) * DPI);
}

function makeSpec(
  kind: PrintMaterialKind,
  label: string,
  trimWidthMm: number,
  trimHeightMm: number,
): PrintMaterialSpec {
  const bleedMm = 3;
  const pageWidthMm = trimWidthMm + bleedMm * 2;
  const pageHeightMm = trimHeightMm + bleedMm * 2;
  return {
    kind,
    label,
    trimWidthMm,
    trimHeightMm,
    bleedMm,
    safeMm: 4,
    pageWidthMm,
    pageHeightMm,
    pngWidthPx: mmToPx(pageWidthMm),
    pngHeightPx: mmToPx(pageHeightMm),
  };
}

export const PRINT_MATERIAL_SPECS: Record<PrintMaterialKind, PrintMaterialSpec> = {
  card: makeSpec("card", "Визитка 90 × 50 мм", 90, 50),
  magnet: makeSpec("magnet", "Магнит 70 × 70 мм", 70, 70),
};

export function canonicalToPublicUrl(canonical: string): string {
  const value = canonical.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(value)) return value;
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(value)) return `http://${value}`;
  return `https://${value}`;
}

export function createDefaultPrintMaterial(
  kind: PrintMaterialKind,
  input: { canonical: string; accent: string },
): PrintMaterialDesign {
  return {
    kind,
    style: kind === "card" ? "accent" : "contrast",
    headline: kind === "card" ? "Заказывайте напрямую" : "Меню всегда под рукой",
    subheadline:
      kind === "card"
        ? "Сканируйте QR-код: актуальное меню, доставка и бонусы"
        : "Наведите камеру и закажите любимые блюда",
    offer: "Спасибо, что выбираете нас!",
    qrUrl: canonicalToPublicUrl(input.canonical),
    campaign: kind === "card" ? "order-card" : "fridge-magnet",
    backgroundColor: kind === "card" ? "#fffaf2" : input.accent,
    textColor: kind === "card" ? "#292019" : "#ffffff",
    accentColor: input.accent,
    showLogo: true,
    showPhone: true,
    showAddress: kind === "card",
  };
}

export function normalizePrintMaterialsSettings(
  value: unknown,
  defaults: PrintMaterialsSettings,
): PrintMaterialsSettings {
  if (!value || typeof value !== "object") return defaults;
  const source = value as Record<string, unknown>;
  const card = printMaterialDesignSchema.safeParse(source.card);
  const magnet = printMaterialDesignSchema.safeParse(source.magnet);
  return {
    card: card.success && card.data.kind === "card" ? card.data : defaults.card,
    magnet: magnet.success && magnet.data.kind === "magnet" ? magnet.data : defaults.magnet,
  };
}

export function buildTrackedQrUrl(design: PrintMaterialDesign): string {
  const parsed = printMaterialDesignSchema.parse(design);
  const url = new URL(parsed.qrUrl);
  url.searchParams.set("utm_source", parsed.kind === "card" ? "order_insert" : "fridge_magnet");
  url.searchParams.set("utm_medium", "qr");
  if (parsed.campaign) url.searchParams.set("utm_campaign", parsed.campaign);
  else url.searchParams.delete("utm_campaign");
  return url.toString();
}

export function printFileStem(slug: string, design: PrintMaterialDesign): string {
  const safeSlug = slug
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "restaurant";
  const size = PRINT_MATERIAL_SPECS[design.kind];
  return `${safeSlug}-${design.kind}-${size.trimWidthMm}x${size.trimHeightMm}mm`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function wrapText(value: string, maxChars: number, maxLines: number): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  for (const word of words) {
    const current = lines.at(-1);
    if (!current || current.length + word.length + 1 > maxChars) {
      if (lines.length === maxLines) {
        const last = lines[maxLines - 1];
        lines[maxLines - 1] = `${last.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
        break;
      }
      lines.push(word.slice(0, maxChars));
    } else {
      lines[lines.length - 1] = `${current} ${word}`;
    }
  }
  return lines;
}

function textLines(
  lines: string[],
  options: { x: number; y: number; size: number; lineHeight: number; weight?: number; anchor?: "start" | "middle" },
): string {
  return lines
    .map(
      (line, index) =>
        `<text x="${options.x}" y="${options.y + index * options.lineHeight}" font-size="${options.size}" font-weight="${options.weight ?? 400}" text-anchor="${options.anchor ?? "start"}">${escapeXml(line)}</text>`,
    )
    .join("");
}

function logoMarkup(brand: PrintBrand, x: number, y: number, size: number, accent: string): string {
  const initial = Array.from(brand.name.trim())[0]?.toUpperCase() ?? "Р";
  const fallback = `<circle cx="${x + size / 2}" cy="${y + size / 2}" r="${size / 2}" fill="${accent}"/><text x="${x + size / 2}" y="${y + size * 0.68}" font-size="${size * 0.55}" font-weight="700" text-anchor="middle" fill="#ffffff">${escapeXml(initial)}</text>`;
  if (!brand.logoUrl) return fallback;
  return `${fallback}<image href="${escapeXml(brand.logoUrl)}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"/>`;
}

function decorations(design: PrintMaterialDesign, spec: PrintMaterialSpec): string {
  if (design.style === "minimal") {
    return `<rect x="${spec.bleedMm + 1}" y="${spec.bleedMm + 1}" width="${spec.trimWidthMm - 2}" height="${spec.trimHeightMm - 2}" rx="2" fill="none" stroke="${design.accentColor}" stroke-width="0.6"/>`;
  }
  if (design.style === "contrast") {
    const panelWidth = design.kind === "card" ? 39 : spec.pageWidthMm;
    const panelX = design.kind === "card" ? spec.pageWidthMm - panelWidth : 0;
    const panelY = design.kind === "card" ? 0 : spec.pageHeightMm * 0.48;
    const panelHeight = design.kind === "card" ? spec.pageHeightMm : spec.pageHeightMm * 0.52;
    return `<rect x="${panelX}" y="${panelY}" width="${panelWidth}" height="${panelHeight}" fill="${design.accentColor}"/>`;
  }
  return `<circle cx="${spec.pageWidthMm * 0.08}" cy="${spec.pageHeightMm * 0.02}" r="${spec.pageHeightMm * 0.45}" fill="${design.accentColor}" opacity="0.14"/><circle cx="${spec.pageWidthMm * 0.98}" cy="${spec.pageHeightMm * 0.92}" r="${spec.pageHeightMm * 0.38}" fill="${design.accentColor}" opacity="0.18"/>`;
}

function cardMarkup(design: PrintMaterialDesign, brand: PrintBrand, qrDataUrl: string): string {
  const spec = PRINT_MATERIAL_SPECS.card;
  const left = spec.bleedMm + spec.safeMm;
  const qrSize = 28;
  const qrX = spec.pageWidthMm - spec.bleedMm - spec.safeMm - qrSize;
  const qrY = spec.bleedMm + spec.safeMm;
  const logo = design.showLogo ? logoMarkup(brand, left, 7, 10, design.accentColor) : "";
  const nameX = design.showLogo ? left + 12 : left;
  const name = wrapText(brand.name, 25, 2);
  const headline = wrapText(design.headline, 25, 2);
  const subheadline = wrapText(design.subheadline, 34, 3);
  const contacts = [design.showPhone ? brand.phone : "", design.showAddress ? brand.address : ""]
    .filter(Boolean)
    .join("  •  ");

  return `
    ${logo}
    <g fill="${design.textColor}">
      ${textLines(name, { x: nameX, y: 10.5, size: 3.4, lineHeight: 3.8, weight: 700 })}
      ${textLines(headline, { x: left, y: 24, size: 5.1, lineHeight: 5.5, weight: 800 })}
      ${textLines(subheadline, { x: left, y: 36, size: 2.45, lineHeight: 3.1 })}
      ${contacts ? `<text x="${left}" y="49" font-size="2.05">${escapeXml(contacts)}</text>` : ""}
    </g>
    <rect x="${qrX - 1.5}" y="${qrY - 1.5}" width="${qrSize + 3}" height="${qrSize + 3}" rx="2" fill="#ffffff"/>
    <image href="${escapeXml(qrDataUrl)}" x="${qrX}" y="${qrY}" width="${qrSize}" height="${qrSize}"/>
    <text x="${qrX + qrSize / 2}" y="${qrY + qrSize + 5}" font-size="2.1" font-weight="700" text-anchor="middle" fill="${design.style === "contrast" ? "#ffffff" : design.textColor}">Сканируйте камерой</text>
    ${design.offer ? `<text x="${qrX + qrSize / 2}" y="${qrY + qrSize + 8.3}" font-size="1.75" text-anchor="middle" fill="${design.style === "contrast" ? "#ffffff" : design.textColor}">${escapeXml(design.offer)}</text>` : ""}
  `;
}

function magnetMarkup(design: PrintMaterialDesign, brand: PrintBrand, qrDataUrl: string): string {
  const spec = PRINT_MATERIAL_SPECS.magnet;
  const center = spec.pageWidthMm / 2;
  const logo = design.showLogo ? logoMarkup(brand, center - 5, 6, 10, design.accentColor) : "";
  const name = wrapText(brand.name, 30, 2);
  const headline = wrapText(design.headline, 27, 2);
  const subheadline = wrapText(design.subheadline, 42, 1);
  const qrSize = 27;
  const qrX = center - qrSize / 2;
  const qrY = 38;
  const phone = design.showPhone && brand.phone ? brand.phone : "";

  return `
    ${logo}
    <g fill="${design.textColor}">
      ${textLines(name, { x: center, y: design.showLogo ? 19.5 : 10, size: 3.25, lineHeight: 3.6, weight: 700, anchor: "middle" })}
      ${textLines(headline, { x: center, y: 27, size: 4.35, lineHeight: 4.6, weight: 800, anchor: "middle" })}
      ${textLines(subheadline, { x: center, y: 35, size: 2.05, lineHeight: 2.5, anchor: "middle" })}
    </g>
    <rect x="${qrX - 1.5}" y="${qrY - 1.5}" width="${qrSize + 3}" height="${qrSize + 3}" rx="2" fill="#ffffff"/>
    <image href="${escapeXml(qrDataUrl)}" x="${qrX}" y="${qrY}" width="${qrSize}" height="${qrSize}"/>
    ${design.offer ? `<text x="${center}" y="69" font-size="1.9" text-anchor="middle" fill="${design.textColor}">${escapeXml(design.offer)}</text>` : ""}
    ${phone ? `<text x="${center}" y="72" font-size="2.35" font-weight="700" text-anchor="middle" fill="${design.textColor}">${escapeXml(phone)}</text>` : ""}
  `;
}

export function buildPrintMaterialSvg(input: {
  design: PrintMaterialDesign;
  brand: PrintBrand;
  qrDataUrl: string;
  showGuides?: boolean;
}): string {
  const design = printMaterialDesignSchema.parse(input.design);
  const spec = PRINT_MATERIAL_SPECS[design.kind];
  const artwork = design.kind === "card" ? cardMarkup(design, input.brand, input.qrDataUrl) : magnetMarkup(design, input.brand, input.qrDataUrl);
  const guides = input.showGuides
    ? `<g fill="none" pointer-events="none">
        <rect x="${spec.bleedMm}" y="${spec.bleedMm}" width="${spec.trimWidthMm}" height="${spec.trimHeightMm}" stroke="#00a3ff" stroke-width="0.25" stroke-dasharray="1 1"/>
        <rect x="${spec.bleedMm + spec.safeMm}" y="${spec.bleedMm + spec.safeMm}" width="${spec.trimWidthMm - spec.safeMm * 2}" height="${spec.trimHeightMm - spec.safeMm * 2}" stroke="#ff3b81" stroke-width="0.2" stroke-dasharray="1 1"/>
      </g>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.pageWidthMm}mm" height="${spec.pageHeightMm}mm" viewBox="0 0 ${spec.pageWidthMm} ${spec.pageHeightMm}">
    <rect width="${spec.pageWidthMm}" height="${spec.pageHeightMm}" fill="${design.backgroundColor}"/>
    ${decorations(design, spec)}
    <g font-family="Arial, 'DejaVu Sans', sans-serif">${artwork}</g>
    ${guides}
  </svg>`;
}
