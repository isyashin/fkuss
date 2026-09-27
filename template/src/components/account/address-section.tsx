"use client";

import { useState, useTransition } from "react";
import { addAddress, deleteAddress, updateAddress } from "@/app/account/actions";
import type { Address } from "@/generated/prisma/client";
import styles from "./account.module.css";

type FormState = { label: string; street: string; entrance: string; floor: string; apartment: string; comment: string };
const EMPTY: FormState = { label: "", street: "", entrance: "", floor: "", apartment: "", comment: "" };

function formatAddress(a: Address): string {
  return [a.label && `${a.label}: `, a.street, a.apartment && `кв. ${a.apartment}`, a.entrance && `под. ${a.entrance}`, a.floor && `эт. ${a.floor}`]
    .filter(Boolean)
    .join(", ");
}

export function AddressSection({ addresses }: { addresses: Address[] }) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [pending, startTransition] = useTransition();

  const startEdit = (a: Address) => {
    setEditingId(a.id);
    setForm({ label: a.label, street: a.street, entrance: a.entrance, floor: a.floor, apartment: a.apartment, comment: a.comment });
    setOpen(false);
  };
  const startAdd = () => { setEditingId(null); setForm(EMPTY); setOpen(true); };
  const close = () => { setOpen(false); setEditingId(null); setForm(EMPTY); };

  return (
    <div className={styles.rows}>
      {addresses.map((a) => (
        <div key={a.id} className={styles.row}>
          <div className={styles.rowMain}>
            <span>{formatAddress(a)}</span>
            {a.comment && <small>{a.comment}</small>}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button type="button" disabled={pending} onClick={() => startEdit(a)}
              className={styles.btn + " " + styles.btnGhost} aria-label="Изменить адрес">
              ✎
            </button>
            <button type="button" disabled={pending}
              onClick={() => { if (confirm("Удалить адрес?")) startTransition(() => deleteAddress(a.id)); }}
              className={styles.btn + " " + styles.btnGhost} style={{ color: "#b3402f" }} aria-label="Удалить адрес">
              ×
            </button>
          </div>
        </div>
      ))}
      {addresses.length === 0 && !open && (
        <p className={styles.note}>Адресов пока нет — добавьте, чтобы заказывать быстрее.</p>
      )}

      {open || editingId ? (
        <form
          className={styles.panel}
          style={{ display: "grid", gap: 10 }}
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              if (editingId) await updateAddress(editingId, form);
              else await addAddress(form);
              close();
            });
          }}
        >
          <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Название (Дом, Работа)" className={styles.input} aria-label="Название адреса" />
          <input value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} placeholder="Улица, дом" required className={styles.input} aria-label="Улица и дом" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            <input value={form.apartment} onChange={(e) => setForm({ ...form, apartment: e.target.value })} placeholder="Кв." className={styles.input} aria-label="Квартира" />
            <input value={form.entrance} onChange={(e) => setForm({ ...form, entrance: e.target.value })} placeholder="Подъезд" className={styles.input} aria-label="Подъезд" />
            <input value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} placeholder="Этаж" className={styles.input} aria-label="Этаж" />
          </div>
          <input value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} placeholder="Комментарий курьеру (необязательно)" className={styles.input} aria-label="Комментарий курьеру" />
          <div className={styles.actionsRow}>
            <button type="submit" disabled={pending} className={styles.btn + " " + styles.btnPrimary}>
              {pending ? "Сохраняю…" : editingId ? "Сохранить изменения" : "Сохранить адрес"}
            </button>
            <button type="button" className={styles.btn + " " + styles.btnGhost} onClick={close}>Отмена</button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={startAdd} className={styles.btn + " " + styles.btnOutline}
          style={{ borderStyle: "dashed", justifySelf: "start" }}>
          + Адрес
        </button>
      )}
    </div>
  );
}
