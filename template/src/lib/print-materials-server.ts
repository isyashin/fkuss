import { lstat, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import QRCode from "qrcode";
import sharp from "sharp";
import { z } from "zod";
import {
  PRINT_MATERIAL_SPECS,
  buildPrintMaterialSvg,
  buildTrackedQrUrl,
  printMaterialDesignSchema,
  type PrintBrand,
  type PrintMaterialDesign,
  type PrintExportFormat,
} from "./print-materials";

export interface PrintExportResult {
  body: Uint8Array;
  contentType: string;
  extension: PrintExportFormat;
}

export const printRestaurantBrandSchema = z.object({
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(80),
  address: z.string().trim().max(300),
  logo: z.string().trim().max(500),
});

type PrintRestaurantBrand = z.infer<typeof printRestaurantBrandSchema>;

const MAX_LOGO_BYTES = 8 * 1024 * 1024;
const MAX_LOGO_PIXELS = 40_000_000;

function mmToPoints(mm: number): number {
  return (mm / 25.4) * 72;
}

async function contentPath(relativePath: string): Promise<string | null> {
  if (!relativePath) return null;
  try {
    const root = await realpath(path.resolve(process.cwd(), "content"));
    const candidate = path.resolve(root, relativePath);
    const lexicalRelative = path.relative(root, candidate);
    if (!lexicalRelative || lexicalRelative.startsWith("..") || path.isAbsolute(lexicalRelative)) {
      return null;
    }

    const linkInfo = await lstat(candidate);
    if (linkInfo.isSymbolicLink() || !linkInfo.isFile()) return null;
    const resolved = await realpath(candidate);
    const resolvedRelative = path.relative(root, resolved);
    if (!resolvedRelative || resolvedRelative.startsWith("..") || path.isAbsolute(resolvedRelative)) {
      return null;
    }
    const fileInfo = await stat(resolved);
    if (fileInfo.size > MAX_LOGO_BYTES) return null;
    return resolved;
  } catch {
    return null;
  }
}

async function logoDataUrl(relativePath: string): Promise<string> {
  const absolute = await contentPath(relativePath);
  if (!absolute) return "";
  try {
    // content/ подключается bind-volume в runtime; не включаем его в standalone trace.
    const source = await readFile(/* turbopackIgnore: true */ absolute);
    const png = await sharp(source, { failOn: "error", limitInputPixels: MAX_LOGO_PIXELS })
      .resize(900, 900, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return "";
  }
}

async function renderArtwork(input: {
  design: PrintMaterialDesign;
  restaurant: PrintRestaurantBrand;
}): Promise<{ svg: string; png: Buffer }> {
  const design = printMaterialDesignSchema.parse(input.design);
  const restaurant = printRestaurantBrandSchema.parse(input.restaurant);
  const trackedUrl = buildTrackedQrUrl(design);
  const [qrDataUrl, embeddedLogo] = await Promise.all([
    QRCode.toDataURL(trackedUrl, {
      errorCorrectionLevel: "H",
      margin: 4,
      width: 1600,
      color: { dark: "#111111", light: "#ffffff" },
    }),
    logoDataUrl(input.restaurant.logo),
  ]);

  const brand: PrintBrand = {
    name: restaurant.name,
    phone: restaurant.phone,
    address: restaurant.address,
    logoUrl: embeddedLogo,
  };
  const svg = buildPrintMaterialSvg({ design, brand, qrDataUrl });
  const spec = PRINT_MATERIAL_SPECS[design.kind];
  const png = await sharp(Buffer.from(svg))
    .resize(spec.pngWidthPx, spec.pngHeightPx, { fit: "fill" })
    .png({ compressionLevel: 9 })
    .withMetadata({ density: 300 })
    .toBuffer();
  return { svg, png };
}

export async function exportPrintMaterial(input: {
  design: PrintMaterialDesign;
  restaurant: PrintRestaurantBrand;
  format: PrintExportFormat;
}): Promise<PrintExportResult> {
  const design = printMaterialDesignSchema.parse(input.design);
  const { svg, png } = await renderArtwork({ design, restaurant: input.restaurant });

  if (input.format === "svg") {
    return {
      body: new TextEncoder().encode(svg),
      contentType: "image/svg+xml; charset=utf-8",
      extension: "svg",
    };
  }

  if (input.format === "png") {
    return { body: new Uint8Array(png), contentType: "image/png", extension: "png" };
  }

  const spec = PRINT_MATERIAL_SPECS[design.kind];
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${spec.label}: ${input.restaurant.name}`);
  pdf.setAuthor(input.restaurant.name);
  pdf.setCreator("Платформа сайтов ресторанов");
  pdf.setProducer("Платформа сайтов ресторанов");
  pdf.setSubject(
    `Обрезной формат ${spec.trimWidthMm} × ${spec.trimHeightMm} мм; вылеты ${spec.bleedMm} мм`,
  );
  const width = mmToPoints(spec.pageWidthMm);
  const height = mmToPoints(spec.pageHeightMm);
  const page = pdf.addPage([width, height]);
  const image = await pdf.embedPng(png);
  page.drawImage(image, { x: 0, y: 0, width, height });
  const bytes = await pdf.save({ useObjectStreams: false });
  return { body: bytes, contentType: "application/pdf", extension: "pdf" };
}
