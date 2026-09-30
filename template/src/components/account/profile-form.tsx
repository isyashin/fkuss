"use client";

import { useState, useTransition } from "react";
import { updateProfile } from "@/app/account/actions";
import styles from "./account.module.css";

export function ProfileForm({ initialName, initialPhone }: { initialName: string; initialPhone: string }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  if (!editing) {
    return (
      <div className={styles.actionsRow}>
        <button type="button" className={styles.btn + " " + styles.btnOutline} onClick={() => { setSaved(false); setEditing(true); }}>
          Изменить имя и телефон
        </button>
        {saved && <span className={styles.note} role="status">Сохранено ✓</span>}
      </div>
    );
  }

  return (
    <form
      style={{ display: "grid", gap: 10, maxWidth: 420 }}
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          setError("");
          const result = await updateProfile({ name, phone });
          if (result.ok) { setSaved(true); setEditing(false); }
          else setError(result.error ?? "Не сохранилось");
        });
      }}
    >
      <label className={styles.field}>
        <span>Имя</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className={styles.input} required maxLength={100} />
      </label>
      <label className={styles.field}>
        <span>Телефон</span>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} className={styles.input} required maxLength={20}
          inputMode="tel" placeholder="+7 …" />
      </label>
      {error && <p role="alert" style={{ color: "#b3402f", fontSize: 13, margin: 0 }}>{error}</p>}
      <div className={styles.actionsRow}>
        <button type="submit" className={styles.btn + " " + styles.btnPrimary} disabled={pending}>
          {pending ? "Сохраняю…" : "Сохранить"}
        </button>
        <button type="button" className={styles.btn + " " + styles.btnGhost} onClick={() => setEditing(false)}>Отмена</button>
      </div>
    </form>
  );
}
