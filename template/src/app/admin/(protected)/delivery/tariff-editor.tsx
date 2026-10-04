"use client";

/** Компактный редактор тарифов зоны: «Цена 300 ₽», уровни — «От 2 000 ₽ → 0 ₽». */
import type { ZoneTariff } from "@/lib/order/pricing";

export function TariffEditor({
  tariffs,
  onChange,
}: {
  tariffs: ZoneTariff[];
  onChange: (tariffs: ZoneTariff[]) => void;
}) {
  const rows = tariffs.length > 0 ? tariffs : [{ from: 0, price: 300 }];
  const inputCls = "w-24 min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15";

  function update(index: number, patch: Partial<ZoneTariff>) {
    onChange(rows.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  return (
    <div className="space-y-2">
      {rows.map((tariff, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          {i === 0 ? (
            <span className="text-sm text-muted w-12">Цена</span>
          ) : (
            <>
              <span className="text-sm text-muted">От</span>
              <input
                type="number"
                min={0}
                step={50}
                value={tariff.from}
                aria-label={`Уровень ${i + 1}: заказ от, ₽`}
                onChange={(e) => update(i, { from: Math.max(0, Number(e.target.value) || 0) })}
                className={inputCls}
              />
              <span className="text-sm text-muted">₽ →</span>
            </>
          )}
          <input
            type="number"
            min={0}
            step={50}
            value={tariff.price}
            aria-label={`Уровень ${i + 1}: доставка, ₽`}
            onChange={(e) => update(i, { price: Math.max(0, Number(e.target.value) || 0) })}
            className={inputCls}
          />
          <span className="text-sm text-muted">₽</span>
          {rows.length > 1 && (
            <button
              type="button"
              onClick={() => onChange(rows.filter((_, index) => index !== i))}
              className="text-xs text-red-600 min-h-11 px-2"
              aria-label={`Удалить уровень ${i + 1}`}
            >
              Удалить
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange([...rows, { from: (rows[rows.length - 1]?.from ?? 0) + 500, price: rows[rows.length - 1]?.price ?? 300 }])
        }
        className="text-sm underline min-h-11"
      >
        + Добавить уровень
      </button>
    </div>
  );
}
