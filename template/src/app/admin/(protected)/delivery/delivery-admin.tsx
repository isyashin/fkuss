"use client";

import { useState, useTransition } from "react";
import { deleteDeliveryOption, saveDeliveryOption, type DeliveryOptionInput } from "./actions";
import type { DeliveryOption } from "@/generated/prisma/client";

const DAY_NAMES = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

const EMPTY: DeliveryOptionInput = {
  name: "",
  mode: "scheduled",
  enabled: true,
  days: [1, 2, 3, 4, 5, 6, 0],
  hoursFrom: "11:00",
  hoursTo: "22:00",
  slotMinutes: 60,
  minAheadMinutes: 120,
  daysAhead: 3,
  price: 300,
  freeFrom: 2000,
  exceptions: [],
};

export function DeliveryAdmin({ options }: { options: DeliveryOption[] }) {
  const [editing, setEditing] = useState<DeliveryOptionInput | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4 max-w-2xl">
      {options.map((option) => (
        <div key={option.id} className="bg-card rounded-[var(--radius)] p-4 flex justify-between gap-3 items-start">
          <div>
            <p className="font-medium">
              {option.name} {option.enabled ? "" : "· выкл"}
            </p>
            <p className="text-muted text-sm mt-1">
              {option.mode === "asap" ? "как можно скорее" : "к выбранному времени"} · {option.hoursFrom}–{option.hoursTo} ·{" "}
              {option.price} ₽{option.freeFrom !== null ? ` · бесплатно от ${option.freeFrom} ₽` : ""}
            </p>
            {option.mode === "scheduled" && (
              <p className="text-muted text-xs mt-0.5">
                слот {option.slotMinutes} мин · не раньше чем через {option.minAheadMinutes} мин · вперёд {option.daysAhead} дн.
              </p>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() =>
                setEditing({
                  id: option.id,
                  name: option.name,
                  mode: option.mode as "asap" | "scheduled",
                  enabled: option.enabled,
                  days: option.days,
                  hoursFrom: option.hoursFrom,
                  hoursTo: option.hoursTo,
                  slotMinutes: option.slotMinutes,
                  minAheadMinutes: option.minAheadMinutes,
                  daysAhead: option.daysAhead,
                  price: option.price,
                  freeFrom: option.freeFrom,
                  exceptions: option.exceptions,
                })
              }
              className="min-h-11 px-4 rounded-full border border-foreground/20 text-sm"
            >
              Править
            </button>
            <button
              disabled={pending}
              onClick={() => {
                if (confirm(`Удалить «${option.name}»?`)) startTransition(() => deleteDeliveryOption(option.id));
              }}
              className="min-h-11 px-4 rounded-full border border-red-300 text-red-600 text-sm"
            >
              Удалить
            </button>
          </div>
        </div>
      ))}

      {!editing ? (
        <button onClick={() => setEditing({ ...EMPTY })} className="w-full min-h-11 px-4 rounded-[9px] border border-foreground/20 bg-card text-sm font-medium">
          + Вариант доставки
        </button>
      ) : (
        <EditForm
          initial={editing}
          pending={pending}
          onCancel={() => setEditing(null)}
          onSave={(input) => startTransition(async () => { await saveDeliveryOption(input); setEditing(null); })}
        />
      )}
    </div>
  );
}

function EditForm({
  initial,
  pending,
  onCancel,
  onSave,
}: {
  initial: DeliveryOptionInput;
  pending: boolean;
  onCancel: () => void;
  onSave: (input: DeliveryOptionInput) => void;
}) {
  const [form, setForm] = useState(initial);
  const inputCls = "mt-1 w-full min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15";

  return (
    <div className="bg-card rounded-[var(--radius)] p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm text-muted">Название</span>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} />
        </label>
        <label className="block">
          <span className="text-sm text-muted">Режим</span>
          <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as "asap" | "scheduled" })} className={inputCls}>
            <option value="asap">как можно скорее</option>
            <option value="scheduled">к выбранному времени</option>
          </select>
        </label>
      </div>

      <label className="flex items-center gap-3 min-h-11">
        <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="w-5 h-5 accent-[var(--accent)]" />
        Вариант включён
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm text-muted">Часы с</span>
          <input type="time" value={form.hoursFrom} onChange={(e) => setForm({ ...form, hoursFrom: e.target.value })} className={inputCls} />
        </label>
        <label className="block">
          <span className="text-sm text-muted">Часы до</span>
          <input type="time" value={form.hoursTo} onChange={(e) => setForm({ ...form, hoursTo: e.target.value })} className={inputCls} />
        </label>
      </div>

      <div>
        <span className="text-sm text-muted">Дни</span>
        <div className="flex gap-1 mt-1 flex-wrap">
          {DAY_NAMES.map((name, i) => (
            <button
              key={i}
              onClick={() =>
                setForm({
                  ...form,
                  days: form.days.includes(i) ? form.days.filter((d) => d !== i) : [...form.days, i].sort(),
                })
              }
              className={`min-w-11 min-h-11 rounded-full text-sm ${form.days.includes(i) ? "bg-accent text-white" : "bg-card border border-foreground/15"}`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {form.mode === "scheduled" && (
        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className="text-sm text-muted">Слот, мин</span>
            <input type="number" min={15} value={form.slotMinutes} onChange={(e) => setForm({ ...form, slotMinutes: Number(e.target.value) })} className={inputCls} />
          </label>
          <label className="block">
            <span className="text-sm text-muted">Не раньше, мин</span>
            <input type="number" min={0} value={form.minAheadMinutes} onChange={(e) => setForm({ ...form, minAheadMinutes: Number(e.target.value) })} className={inputCls} />
          </label>
          <label className="block">
            <span className="text-sm text-muted">Вперёд, дней</span>
            <input type="number" min={0} max={30} value={form.daysAhead} onChange={(e) => setForm({ ...form, daysAhead: Number(e.target.value) })} className={inputCls} />
          </label>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-sm text-muted">Цена, ₽</span>
          <input type="number" min={0} value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} className={inputCls} />
        </label>
        <label className="block">
          <span className="text-sm text-muted">Бесплатно от, ₽</span>
          <input
            type="number"
            min={0}
            value={form.freeFrom ?? ""}
            onChange={(e) => setForm({ ...form, freeFrom: e.target.value === "" ? null : Number(e.target.value) })}
            placeholder="нет"
            className={inputCls}
          />
        </label>
      </div>

      <label className="block">
        <span className="text-sm text-muted">Даты-исключения (через запятую, YYYY-MM-DD)</span>
        <input
          value={form.exceptions.join(", ")}
          onChange={(e) => setForm({ ...form, exceptions: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
          placeholder="2026-01-01, 2026-01-02"
          className={inputCls}
        />
      </label>

      <div className="flex gap-2">
        <button
          disabled={pending || !form.name}
          onClick={() => onSave(form)}
          className="min-h-11 px-5 rounded-full bg-accent text-white text-sm font-medium disabled:opacity-50"
        >
          Сохранить
        </button>
        <button onClick={onCancel} className="min-h-11 px-4 rounded-full border border-foreground/20 text-sm">
          Отмена
        </button>
      </div>
    </div>
  );
}
