"use client";

/** Условия доставки: порог суммы заказа и стоимость для каждого уровня. */
import type { ZoneTariff } from "@/lib/order/pricing";

export function TariffEditor({
  tariffs,
  onChange,
}: {
  tariffs: ZoneTariff[];
  onChange: (tariffs: ZoneTariff[]) => void;
}) {
  const rows = tariffs.length > 0 ? tariffs : [{ from: 0, price: 300 }];
  const inputCls = "w-full min-w-0 min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15";
  const rowCls = "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px] items-center gap-2";

  function update(index: number, patch: Partial<ZoneTariff>) {
    onChange(rows.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  function remove(index: number) {
    const next = rows.filter((_, i) => i !== index);
    onChange(next.map((tariff, i) => i === 0 ? { ...tariff, from: 0 } : tariff));
  }

  return (
    <div className="space-y-2 max-w-md min-w-0">
      <div className={`${rowCls} text-xs text-muted`}>
        <span>Заказ от, ₽</span>
        <span>Доставка, ₽</span>
      </div>
      {rows.map((tariff, i) => (
        <div key={i} className={rowCls}>
          {i === 0 ? (
            <span aria-label="Уровень 1: заказ от, ₽" className="min-h-11 px-3 inline-flex items-center text-sm">0</span>
          ) : (
            <input
              type="number"
              min={0}
              step={50}
              value={tariff.from}
              aria-label={`Уровень ${i + 1}: заказ от, ₽`}
              onChange={(e) => update(i, { from: Math.max(0, Number(e.target.value) || 0) })}
              className={inputCls}
            />
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
          {i > 0 && (
            <button
              type="button"
              onClick={() => remove(i)}
              className="w-11 min-h-11 inline-flex items-center justify-center rounded-[var(--radius)] text-muted hover:text-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current"
              aria-label={`Удалить уровень ${i + 1}`}
              title="Удалить уровень"
            >
              <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 7h16M10 4h4M6 7l1 13h10l1-13M10 10v7M14 10v7" />
              </svg>
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
