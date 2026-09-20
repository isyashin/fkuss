"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { deleteHall, saveBanquetsSettings, saveHall, type BanquetsSettings } from "./actions";
import { contentAssetUrl } from "@/lib/assets";
import type { BanquetHall } from "@/generated/prisma/client";

const DEFAULTS: BanquetsSettings = {
  enabled: false,
  title: "Банкеты",
  description: "",
  conditions: "",
  pricesText: "",
  contactPhone: "",
  ctaText: "",
  ctaUrl: "",
};

export function BanquetsAdmin({
  settings,
  halls,
}: {
  settings: Record<string, unknown>;
  halls: BanquetHall[];
}) {
  const [s, setS] = useState<BanquetsSettings>({ ...DEFAULTS, ...(settings as Partial<BanquetsSettings>) });
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const inputCls = "mt-1 w-full min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15";

  return (
    <div className="space-y-8 max-w-2xl">
      <section className="bg-card rounded-[var(--radius)] p-5 space-y-3">
        <label className="flex items-center gap-3 min-h-11">
          <input
            type="checkbox"
            checked={s.enabled}
            onChange={(e) => setS({ ...s, enabled: e.target.checked })}
            className="w-5 h-5 accent-[var(--accent)]"
          />
          Раздел «Банкеты» включён (кнопка на главной + страница /banquets)
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-muted">Заголовок</span>
            <input value={s.title} onChange={(e) => setS({ ...s, title: e.target.value })} className={inputCls} />
          </label>
          <label className="block">
            <span className="text-sm text-muted">Телефон банкетного менеджера</span>
            <input value={s.contactPhone} onChange={(e) => setS({ ...s, contactPhone: e.target.value })} className={inputCls} />
          </label>
        </div>
        <label className="block">
          <span className="text-sm text-muted">Описание</span>
          <textarea rows={2} value={s.description} onChange={(e) => setS({ ...s, description: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-[var(--radius)] bg-card border border-foreground/15" />
        </label>
        <label className="block">
          <span className="text-sm text-muted">Условия</span>
          <textarea rows={3} value={s.conditions} onChange={(e) => setS({ ...s, conditions: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-[var(--radius)] bg-card border border-foreground/15" />
        </label>
        <label className="block">
          <span className="text-sm text-muted">Цены (опционально)</span>
          <textarea rows={2} value={s.pricesText} onChange={(e) => setS({ ...s, pricesText: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-[var(--radius)] bg-card border border-foreground/15" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-muted">Текст CTA-кнопки</span>
            <input value={s.ctaText} onChange={(e) => setS({ ...s, ctaText: e.target.value })} placeholder="Оставить заявку" className={inputCls} />
          </label>
          <label className="block">
            <span className="text-sm text-muted">Ссылка CTA</span>
            <input value={s.ctaUrl} onChange={(e) => setS({ ...s, ctaUrl: e.target.value })} placeholder="https://wa.me/…" className={inputCls} />
          </label>
        </div>
        <button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await saveBanquetsSettings(s);
              setSaved(true);
              setTimeout(() => setSaved(false), 3000);
            })
          }
          className="min-h-11 px-5 rounded-full bg-accent text-white text-sm font-medium disabled:opacity-50"
        >
          Сохранить настройки
        </button>
        {saved && <span className="ml-3 text-green-600 text-sm">Сохранено ✓</span>}
      </section>

      <section>
        <h2 className="text-xl mb-3">Залы</h2>
        <div className="space-y-3">
          {halls.map((hall) => (
            <HallRow key={hall.id} hall={hall} />
          ))}
        </div>
        <AddHallForm />
      </section>
    </div>
  );
}

function HallRow({ hall }: { hall: BanquetHall }) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: hall.name, capacity: hall.capacity, description: hall.description });
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="bg-card rounded-[var(--radius)] p-3 flex gap-3 items-start">
      <button onClick={() => fileRef.current?.click()} className="relative w-20 h-14 rounded-lg overflow-hidden bg-foreground/5 shrink-0" title="Заменить фото">
        {hall.image ? (
          <Image src={contentAssetUrl(hall.image)} alt={hall.name} fill sizes="80px" className="object-cover" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-muted text-xs">+ фото</span>
        )}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const fd = new FormData();
          fd.append("file", file);
          fd.append("section", "gallery");
          fd.append("name", `hall-${hall.id}`);
          const response = await fetch("/api/admin/upload", { method: "POST", body: fd });
          const data = await response.json();
          if (response.ok) {
            startTransition(async () => {
              await saveHall({ id: hall.id, name: form.name, capacity: form.capacity, description: form.description, image: data.path });
              location.reload();
            });
          }
        }}
      />

      {editing ? (
        <div className="flex-1 space-y-2">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full min-h-11 px-3 rounded-[var(--radius)] border border-foreground/15" />
          <input value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} placeholder="Вместимость (например, до 40 гостей)" className="w-full min-h-11 px-3 rounded-[var(--radius)] border border-foreground/15" />
          <textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 rounded-[var(--radius)] border border-foreground/15" />
          <div className="flex gap-2">
            <button
              disabled={pending}
              onClick={() => startTransition(async () => { await saveHall({ id: hall.id, ...form }); setEditing(false); })}
              className="min-h-11 px-5 rounded-full bg-accent text-white text-sm font-medium disabled:opacity-50"
            >
              Сохранить
            </button>
            <button onClick={() => setEditing(false)} className="min-h-11 px-4 rounded-full border border-foreground/20 text-sm">Отмена</button>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-w-0">
          <div className="flex justify-between gap-2 items-baseline">
            <p className="font-medium">{hall.name}</p>
            <p className="text-muted text-sm">{hall.capacity}</p>
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={() => setEditing(true)} className="min-h-11 px-4 rounded-full border border-foreground/20 text-sm">Править</button>
            <button
              disabled={pending}
              onClick={() => { if (confirm(`Удалить зал «${hall.name}»?`)) startTransition(() => deleteHall(hall.id)); }}
              className="min-h-11 px-4 rounded-full border border-red-300 text-red-600 text-sm"
            >
              Удалить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AddHallForm() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", capacity: "", description: "" });
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="min-h-11 px-4 rounded-full border border-dashed border-foreground/30 text-sm text-muted">
        + Зал
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          await saveHall(form);
          setForm({ name: "", capacity: "", description: "" });
          setOpen(false);
        });
      }}
      className="bg-card rounded-[var(--radius)] p-3 space-y-2"
    >
      <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Название зала" required className="w-full min-h-11 px-3 rounded-[var(--radius)] border border-foreground/15" />
      <input value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} placeholder="Вместимость" className="w-full min-h-11 px-3 rounded-[var(--radius)] border border-foreground/15" />
      <button disabled={pending} className="min-h-11 px-5 rounded-full bg-accent text-white text-sm font-medium disabled:opacity-50">
        Добавить зал
      </button>
    </form>
  );
}
