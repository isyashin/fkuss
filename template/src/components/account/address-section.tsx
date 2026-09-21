"use client";

import { useState, useTransition } from "react";
import { addAddress, deleteAddress } from "@/app/account/actions";
import type { Address } from "@/generated/prisma/client";

function formatAddress(a: Address): string {
  return [a.label && `${a.label}: `, a.street, a.apartment && `кв. ${a.apartment}`, a.entrance && `под. ${a.entrance}`, a.floor && `эт. ${a.floor}`]
    .filter(Boolean)
    .join(", ");
}

export function AddressSection({ addresses }: { addresses: Address[] }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ label: "", street: "", entrance: "", floor: "", apartment: "", comment: "" });
  const [pending, startTransition] = useTransition();
  const inputCls = "w-full min-h-11 px-3 rounded-[var(--radius)] bg-background border border-foreground/15";

  return (
    <div className="space-y-2">
      {addresses.map((a) => (
        <div key={a.id} className="bg-card rounded-[var(--radius)] p-3 flex justify-between gap-3 items-center">
          <p className="text-sm">{formatAddress(a)}</p>
          <button
            disabled={pending}
            onClick={() => startTransition(() => deleteAddress(a.id))}
            className="min-w-11 min-h-11 text-red-500"
            aria-label="Удалить адрес"
          >
            ×
          </button>
        </div>
      ))}
      {addresses.length === 0 && <p className="text-muted text-sm">Адресов пока нет — добавьте, чтобы заказывать быстрее.</p>}

      {!open ? (
        <button onClick={() => setOpen(true)} className="min-h-11 px-4 rounded-full border border-dashed border-foreground/30 text-sm text-muted">
          + Адрес
        </button>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              await addAddress(form);
              setForm({ label: "", street: "", entrance: "", floor: "", apartment: "", comment: "" });
              setOpen(false);
            });
          }}
          className="bg-card rounded-[var(--radius)] p-3 space-y-2"
        >
          <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Название (Дом, Работа)" className={inputCls} />
          <input value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} placeholder="Улица, дом" required className={inputCls} />
          <div className="grid grid-cols-3 gap-2">
            <input value={form.apartment} onChange={(e) => setForm({ ...form, apartment: e.target.value })} placeholder="Кв." className={inputCls} />
            <input value={form.entrance} onChange={(e) => setForm({ ...form, entrance: e.target.value })} placeholder="Подъезд" className={inputCls} />
            <input value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} placeholder="Этаж" className={inputCls} />
          </div>
          <button disabled={pending} className="min-h-11 px-5 rounded-full bg-accent text-white text-sm font-medium disabled:opacity-50">
            Сохранить адрес
          </button>
        </form>
      )}
    </div>
  );
}
