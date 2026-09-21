import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import QRCode from "qrcode";
import sharp from "sharp";
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

function mmToPoints(mm: number): number {
  return (mm / 25.4) * 72;
}

function contentPath(relativePath: string): string | null {
  if (!relativePath) return null;
  const root = path.resolve(process.cwd(), "content");
  const absolute = path.resolve(root, relativePath);
  const relative = path.relative(root, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return absolute;
}

async function logoDataUrl(relativePath: string): Promise<string> {
  const absolute = contentPath(relativePath);
  if (!absolute) return "";
  try {
    const source = await readFile(absolute);
    const png = await sharp(source)
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
  restaurant: { name: string; phone: string; address: string; logo: string };
}): Promise<{ svg: string; png: Buffer }> {
  const design = printMaterialDesignSchema.parse(input.design);
  const trackedUrl = buildTrackedQrUrl(design);
  const [qrDataUrl, embeddedLogo] = await Promise.all([
    QRCode.toDataURL(trackedUrl, {
      errorCorrectionLevel: "H",
      margin: 2,
      width: 1600,
      color: { dark: "#111111", light: "#ffffff" },
    }),
    logoDataUrl(input.restaurant.logo),
  ]);

  const brand: PrintBrand = {
    name: input.restaurant.name,
    phone: input.restaurant.phone,
    address: input.restaurant.address,
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
  restaurant: { name: string; phone: string; address: string; logo: string };
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
