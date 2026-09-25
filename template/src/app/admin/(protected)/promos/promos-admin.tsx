"use client";

import { useState, useTransition } from "react";
import { deletePromo, savePromo } from "../content-actions";
import type { Promo } from "@/generated/prisma/client";

export function PromosAdmin({ promos }: { promos: Promo[] }) {
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ title: "", text: "" });

  return (
    <div className="space-y-4 max-w-2xl">
      {promos.map((promo) => (
        <div key={promo.id} className="bg-card rounded-[var(--radius)] p-4 flex justify-between gap-3">
          <div>
            <p className="font-medium">{promo.title}</p>
            <p className="text-muted text-sm mt-1">{promo.text}</p>
          </div>
          <button
            disabled={pending}
            onClick={() => {
              if (confirm(`Удалить «${promo.title}»?`)) startTransition(() => deletePromo(promo.id));
            }}
            className="min-h-11 px-4 rounded-full border border-red-300 text-red-600 text-sm shrink-0"
          >
            Удалить
          </button>
        </div>
      ))}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            await savePromo(form);
            setForm({ title: "", text: "" });
          });
        }}
        className="bg-card rounded-[var(--radius)] p-4 space-y-2"
      >
        <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs text-muted">Заголовок акции<input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="Заголовок акции"
          required
          className="w-full min-h-11 px-3 rounded-[var(--radius)] border border-foreground/15"
        /></label>
        <label className="block text-xs text-muted">Текст акции<textarea
          value={form.text}
          onChange={(e) => setForm({ ...form, text: e.target.value })}
          placeholder="Текст"
          rows={2}
          className="w-full px-3 py-2 rounded-[var(--radius)] border border-foreground/15"
        /></label>
        </div>
        <button disabled={pending} className="min-h-11 px-5 rounded-full bg-accent text-white text-sm font-medium disabled:opacity-50">
          Добавить акцию
        </button>
      </form>
    </div>
  );
}
