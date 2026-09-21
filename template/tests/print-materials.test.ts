import { describe, expect, it } from "vitest";
import {
  PRINT_MATERIAL_SPECS,
  buildPrintMaterialSvg,
  buildTrackedQrUrl,
  canonicalToPublicUrl,
  createDefaultPrintMaterial,
  normalizePrintMaterialsSettings,
  printFileStem,
  printMaterialDesignSchema,
  withCanonicalQrUrl,
} from "../src/lib/print-materials";

const input = { canonical: "orders.example.ru", accent: "#b45309" };

describe("print materials", () => {
  it("задаёт типографские размеры с вылетами и 300 dpi", () => {
    expect(PRINT_MATERIAL_SPECS.card).toMatchObject({
      trimWidthMm: 90,
      trimHeightMm: 50,
      pageWidthMm: 96,
      pageHeightMm: 56,
      bleedMm: 3,
    });
    expect(PRINT_MATERIAL_SPECS.card.pngWidthPx).toBe(1134);
    expect(PRINT_MATERIAL_SPECS.magnet).toMatchObject({
      trimWidthMm: 70,
      trimHeightMm: 70,
      pageWidthMm: 76,
      pageHeightMm: 76,
    });
    expect(PRINT_MATERIAL_SPECS.magnet.pngWidthPx).toBe(898);
  });

  it("нормализует canonical в публичную ссылку", () => {
    expect(canonicalToPublicUrl("orders.example.ru/")).toBe("https://orders.example.ru");
    expect(canonicalToPublicUrl("localhost:3000")).toBe("http://localhost:3000");
    expect(canonicalToPublicUrl("https://orders.example.ru/")).toBe("https://orders.example.ru");
  });

  it("добавляет разные UTM-источники для визитки и магнита", () => {
    const card = createDefaultPrintMaterial("card", input);
    const magnet = createDefaultPrintMaterial("magnet", input);
    const cardUrl = new URL(buildTrackedQrUrl(card));
    const magnetUrl = new URL(buildTrackedQrUrl(magnet));

    expect(cardUrl.searchParams.get("utm_source")).toBe("order_insert");
    expect(cardUrl.searchParams.get("utm_medium")).toBe("qr");
    expect(cardUrl.searchParams.get("utm_campaign")).toBe("order-card");
    expect(magnetUrl.searchParams.get("utm_source")).toBe("fridge_magnet");
  });

  it("заменяет клиентский QR URL на canonical текущего ресторана", () => {
    const design = {
      ...createDefaultPrintMaterial("card", input),
      qrUrl: "https://example-attacker.test/phishing",
    };
    expect(withCanonicalQrUrl(design, "orders.example.ru").qrUrl).toBe(
      "https://orders.example.ru",
    );
  });

  it("не принимает опасные протоколы и некорректную campaign", () => {
    const design = createDefaultPrintMaterial("card", input);
    expect(printMaterialDesignSchema.safeParse({ ...design, qrUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(printMaterialDesignSchema.safeParse({ ...design, campaign: "заказы со скидкой" }).success).toBe(false);
  });

  it("не подмешивает повреждённые сохранённые настройки", () => {
    const defaults = {
      card: createDefaultPrintMaterial("card", input),
      magnet: createDefaultPrintMaterial("magnet", input),
    };
    const result = normalizePrintMaterialsSettings(
      { card: { ...defaults.card, qrUrl: "file:///etc/passwd" }, magnet: defaults.magnet },
      defaults,
    );
    expect(result.card).toEqual(defaults.card);
    expect(result.magnet).toEqual(defaults.magnet);
  });

  it("экранирует текст в SVG и добавляет направляющие только в preview", () => {
    const design = { ...createDefaultPrintMaterial("card", input), headline: "Заказ <быстро> & вкусно" };
    const brand = { name: "Кафе & бар", phone: "+7 999 000-00-00", address: "Улица <1>", logoUrl: "" };
    const qrDataUrl = "data:image/png;base64,AA==";
    const preview = buildPrintMaterialSvg({ design, brand, qrDataUrl, showGuides: true });
    const exportSvg = buildPrintMaterialSvg({ design, brand, qrDataUrl });

    expect(preview).toContain('width="96mm"');
    expect(preview).toContain("Заказ &lt;быстро&gt; &amp; вкусно");
    expect(preview).toContain("stroke-dasharray");
    expect(exportSvg).not.toContain("stroke-dasharray");
  });

  it("формирует безопасное имя файла", () => {
    const design = createDefaultPrintMaterial("magnet", input);
    expect(printFileStem("У Мамы / Иваново", design)).toBe("restaurant-magnet-70x70mm");
    expect(printFileStem("u-mamy", design)).toBe("u-mamy-magnet-70x70mm");
  });

  it("держит текст магнита в безопасной зоне и сокращает длинный offer", () => {
    const design = {
      ...createDefaultPrintMaterial("magnet", input),
      offer: "Очень длинное предложение для гостя, которое не должно выйти за край печатного макета",
    };
    const svg = buildPrintMaterialSvg({
      design,
      brand: { name: "Ресторан", phone: "+7 999 000-00-00", address: "Адрес", logoUrl: "" },
      qrDataUrl: "data:image/png;base64,AA==",
    });
    const textBaselines = [...svg.matchAll(/<text[^>]* y="([\d.]+)"/g)].map((match) => Number(match[1]));
    expect(Math.max(...textBaselines)).toBeLessThanOrEqual(69);
    expect(svg).not.toContain(design.offer);
    expect(svg).toContain("…");
  });

  it("сокращает длинные контакты визитки, не выпуская их за безопасную зону", () => {
    const design = { ...createDefaultPrintMaterial("card", input), offer: "" };
    const brand = {
      name: "Ресторан",
      phone: "+7 999 000-00-00, +7 999 111-11-11",
      address: "Очень длинный адрес ресторана с корпусом, строением, этажом и подробным ориентиром для курьера",
      logoUrl: "",
    };
    const svg = buildPrintMaterialSvg({
      design,
      brand,
      qrDataUrl: "data:image/png;base64,AA==",
    });

    expect(svg).not.toContain(brand.address);
    expect(svg).toContain("…");
    const textBaselines = [...svg.matchAll(/<text[^>]* y="([\d.]+)"/g)].map((match) => Number(match[1]));
    expect(Math.max(...textBaselines)).toBeLessThanOrEqual(49);
  });
});
