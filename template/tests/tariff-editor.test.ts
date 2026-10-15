import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TariffEditor } from "@/app/admin/(protected)/delivery/tariff-editor";
import { zoneTariffs } from "@/lib/order/pricing";

describe("редактор тарифов зоны", () => {
  it("показывает только условия «от суммы заказа — цена доставки»", () => {
    const markup = renderToStaticMarkup(createElement(TariffEditor, {
      tariffs: zoneTariffs({
        name: "Город",
        tariffs: [{ from: 0, price: 300 }, { from: 3000, price: 300 }, { from: 4000, price: 0 }],
      }),
      onChange: () => {},
    }));

    expect(markup).not.toContain(">Цена<");
    expect(markup).not.toContain("Уровень 3:");
    expect(markup).toContain("Заказ от, ₽");
    expect(markup).toContain("Доставка, ₽");
    expect(markup).toContain('aria-label="Уровень 1: заказ от, ₽"');
    expect(markup).toContain('aria-label="Уровень 1: доставка, ₽"');
    expect(markup).toContain('aria-label="Уровень 2: заказ от, ₽"');
    expect(markup).not.toContain('aria-label="Удалить уровень 1"');
    expect(markup).toContain('aria-label="Удалить уровень 2"');
    expect(markup).toContain('value="4000"');
  });
});
