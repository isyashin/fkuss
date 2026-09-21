import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { createDefaultPrintMaterial, PRINT_MATERIAL_SPECS } from "../src/lib/print-materials";
import { exportPrintMaterial } from "../src/lib/print-materials-server";

const restaurant = {
  name: "Тестовый ресторан",
  phone: "+7 999 000-00-00",
  address: "ул. Тестовая, 1",
  logo: "images/missing-logo.png",
};

describe("print material export", () => {
  const design = createDefaultPrintMaterial("card", {
    canonical: "orders.example.ru",
    accent: "#b45309",
  });

  it("создаёт самостоятельный SVG без направляющих", async () => {
    const result = await exportPrintMaterial({ design, restaurant, format: "svg" });
    const text = new TextDecoder().decode(result.body);

    expect(result.contentType).toContain("image/svg+xml");
    expect(text).toContain('width="96mm"');
    expect(text).toContain("data:image/png;base64,");
    expect(text).not.toContain("stroke-dasharray");
  });

  it("создаёт PNG с физическим размером 300 dpi", async () => {
    const result = await exportPrintMaterial({ design, restaurant, format: "png" });
    const metadata = await sharp(result.body).metadata();

    expect(result.contentType).toBe("image/png");
    expect(metadata.width).toBe(PRINT_MATERIAL_SPECS.card.pngWidthPx);
    expect(metadata.height).toBe(PRINT_MATERIAL_SPECS.card.pngHeightPx);
    expect(metadata.density).toBe(300);
  });

  it("создаёт PDF с точным размером страницы и вылетами", async () => {
    const result = await exportPrintMaterial({ design, restaurant, format: "pdf" });
    const pdf = await PDFDocument.load(result.body);
    const page = pdf.getPage(0);
    const expectedWidth = (PRINT_MATERIAL_SPECS.card.pageWidthMm / 25.4) * 72;
    const expectedHeight = (PRINT_MATERIAL_SPECS.card.pageHeightMm / 25.4) * 72;

    expect(result.contentType).toBe("application/pdf");
    expect(page.getWidth()).toBeCloseTo(expectedWidth, 4);
    expect(page.getHeight()).toBeCloseTo(expectedHeight, 4);
  });
});
