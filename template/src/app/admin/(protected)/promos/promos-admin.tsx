"use client";

import { useState, useTransition } from "react";
import { deletePromo, savePromo } from "../content-actions";
import type { Promo } from "@/generated/prisma/client";

const inputCls = "w-full min-h-11 px-3 rounded-[var(--radius)] border border-foreground/15 bg-card";
const labelCls = "block text-xs text-muted";

/** Период показа акции: строка для списка. */
function periodText(promo: Promo): string {
  if (promo.activeFrom && promo.activeTo) return `${promo.activeFrom} — ${promo.activeTo}`;
  if (promo.activeFrom) return `с ${promo.activeFrom}`;
  if (promo.activeTo) return `до ${promo.activeTo}`;
  return "постоянная";
}

export function PromosAdmin({ promos }: { promos: Promo[] }) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", text: "", enabled: true, activeFrom: "", activeTo: "" });

  return (
    <div className="space-y-4 max-w-2xl">
      {promos.map((promo) => (
        <div key={promo.id} className="bg-card rounded-[var(--radius)] p-4 flex justify-between gap-3" data-promo-name={promo.title}>
          <div className="min-w-0">
            <p className="font-medium">{promo.title}{promo.enabled ? "" : " · выключена"}</p>
            <p className="text-muted text-sm mt-1">{promo.text}</p>
            <p className="text-muted text-xs mt-0.5">{periodText(promo)}</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              disabled={pending}
              onClick={() => setEditing(editing === promo.id ? null : promo.id)}
              className="min-h-11 px-4 rounded-[9px] border border-foreground/20 bg-card text-sm"
            >
              Править
            </button>
            <button
              disabled={pending}
              aria-label={`Удалить акцию ${promo.title}`}
              onClick={() => {
                if (confirm(`Удалить «${promo.title}»?`)) startTransition(() => deletePromo(promo.id));
              }}
              className="min-h-11 px-4 rounded-[9px] border border-red-300 text-red-600 text-sm"
            >
              Удалить
            </button>
          </div>
        </div>
      ))}

      {editing && (
        <EditPromoForm
          promo={promos.find((promo) => promo.id === editing)!}
          pending={pending}
          onCancel={() => setEditing(null)}
          onSave={(input) => startTransition(async () => { await savePromo(input); setEditing(null); })}
        />
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            await savePromo({
              title: form.title,
              text: form.text,
              enabled: form.enabled,
              activeFrom: form.activeFrom || null,
              activeTo: form.activeTo || null,
            });
            setForm({ title: "", text: "", enabled: true, activeFrom: "", activeTo: "" });
          });
        }}
        className="bg-card rounded-[var(--radius)] p-4 space-y-3"
      >
        <div className="grid grid-cols-2 gap-3">
          <label className={labelCls}>Заголовок акции<input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Заголовок акции"
            required
            className={inputCls}
          /></label>
          <label className={labelCls}>Текст акции<textarea
            value={form.text}
            onChange={(e) => setForm({ ...form, text: e.target.value })}
            placeholder="Текст"
            rows={2}
            className="w-full px-3 py-2 rounded-[var(--radius)] border border-foreground/15 bg-card"
          /></label>
          <label className={labelCls}>Показывать с (YYYY-MM-DD)<input
            type="date"
            value={form.activeFrom}
            onChange={(e) => setForm({ ...form, activeFrom: e.target.value })}
            className={inputCls}
          /></label>
          <label className={labelCls}>Показывать до (YYYY-MM-DD)<input
            type="date"
            value={form.activeTo}
            onChange={(e) => setForm({ ...form, activeTo: e.target.value })}
            className={inputCls}
          /></label>
        </div>
        <label className="flex items-center gap-3 min-h-11 text-sm">
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="w-5 h-5 accent-[var(--accent)]" />
          Показывать на сайте
        </label>
        <button disabled={pending} className="min-h-11 px-4 rounded-[9px] border border-foreground/20 bg-card text-sm font-medium disabled:opacity-50">
          Добавить акцию
        </button>
      </form>
    </div>
  );
}

function EditPromoForm({ promo, pending, onCancel, onSave }: {
  promo: Promo;
  pending: boolean;
  onCancel: () => void;
  onSave: (input: { id: string; title: string; text: string; enabled: boolean; activeFrom: string | null; activeTo: string | null }) => void;
}) {
  const [form, setForm] = useState({
    title: promo.title,
    text: promo.text,
    enabled: promo.enabled,
    activeFrom: promo.activeFrom ?? "",
    activeTo: promo.activeTo ?? "",
  });
  const inputCls = "w-full min-h-11 px-3 rounded-[var(--radius)] border border-foreground/15 bg-card";
  const labelCls = "block text-xs text-muted";
  return (
    <div className="bg-card rounded-[var(--radius)] p-4 space-y-3 border border-foreground/15">
      <div className="grid grid-cols-2 gap-3">
        <label className={labelCls}>Заголовок акции<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} /></label>
        <label className={labelCls}>Текст акции<textarea value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} rows={2} className="w-full px-3 py-2 rounded-[var(--radius)] border border-foreground/15 bg-card" /></label>
        <label className={labelCls}>Показывать с (YYYY-MM-DD)<input type="date" value={form.activeFrom} onChange={(e) => setForm({ ...form, activeFrom: e.target.value })} className={inputCls} /></label>
        <label className={labelCls}>Показывать до (YYYY-MM-DD)<input type="date" value={form.activeTo} onChange={(e) => setForm({ ...form, activeTo: e.target.value })} className={inputCls} /></label>
      </div>
      <label className="flex items-center gap-3 min-h-11 text-sm">
        <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="w-5 h-5 accent-[var(--accent)]" />
        Показывать на сайте
      </label>
      <div className="flex gap-2">
        <button
          disabled={pending || !form.title}
          onClick={() => onSave({ id: promo.id, title: form.title, text: form.text, enabled: form.enabled, activeFrom: form.activeFrom || null, activeTo: form.activeTo || null })}
          className="min-h-11 px-4 rounded-[9px] bg-accent text-white text-sm font-medium disabled:opacity-50"
        >
          Сохранить
        </button>
        <button onClick={onCancel} className="min-h-11 px-4 rounded-[9px] border border-foreground/20 text-sm">Отмена</button>
      </div>
    </div>
  );
}
