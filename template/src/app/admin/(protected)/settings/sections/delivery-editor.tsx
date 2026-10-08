"use client";

import { useState, useTransition } from "react";
import { useSettingsSave } from "../use-settings-save";
import { saveSettings } from "../actions";
import type { ContentSettings } from "@/lib/content-schema";
import rd from "../../admin-redesign.module.css";
import styles from "../settings-redesign.module.css";

const TIMEZONES = [
  ["Europe/Kaliningrad", "Калининград (UTC+2)"], ["Europe/Moscow", "Москва (UTC+3)"],
  ["Europe/Samara", "Самара (UTC+4)"], ["Asia/Yekaterinburg", "Екатеринбург (UTC+5)"],
  ["Asia/Omsk", "Омск (UTC+6)"], ["Asia/Krasnoyarsk", "Красноярск (UTC+7)"],
  ["Asia/Irkutsk", "Иркутск (UTC+8)"], ["Asia/Yakutsk", "Якутск (UTC+9)"],
  ["Asia/Vladivostok", "Владивосток (UTC+10)"], ["Asia/Kamchatka", "Камчатка (UTC+12)"],
] as const;

/** Доставка и самовывоз: общие условия. Зоны и geo-режим — этой же секцией (этап 3). */
export function DeliveryEditor({ settings }: { settings: ContentSettings }) {
  const [delivery, setDelivery] = useState(settings.delivery);
  const [timezone, setTimezone] = useState(settings.timezone);
  const [saved, setSaved] = useState({ delivery: settings.delivery, timezone: settings.timezone });
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const { save: saveWithRev, control: revControl } = useSettingsSave();
  const dirty = JSON.stringify(delivery) !== JSON.stringify(saved.delivery) || timezone !== saved.timezone;

  function save() {
    startTransition(async () => {
      setStatus(null);
      try {
        const next: ContentSettings = { ...settings, delivery, timezone };
        const revResult = await saveWithRev(next); if (revResult !== "ok") { if (revResult === "error") throw new Error("Не удалось сохранить"); return; }
        setSaved({ delivery, timezone });
        setStatus({ text: "Сохранено", error: false });
      } catch (cause) {
        setStatus({ text: cause instanceof Error ? cause.message : "Не удалось сохранить", error: true });
      }
    });
  }

  return <section className={styles.editorCard} aria-label="Доставка и самовывоз">
    <h2 className={styles.editorTitle}>Доставка и самовывоз</h2>
    <p className={styles.editorHint}>Общие условия. Зоны доставки, geo-режим и условия курьеров редактируются ниже в этой же секции.</p>
    <div className={styles.toggleList}>
      <label className={styles.toggleRow}><input type="checkbox" checked={delivery.enabled} onChange={(e) => setDelivery({ ...delivery, enabled: e.target.checked })} />Доставка включена</label>
      <label className={styles.toggleRow}><input type="checkbox" checked={delivery.pickupEnabled} onChange={(e) => setDelivery({ ...delivery, pickupEnabled: e.target.checked })} />Самовывоз включён</label>
    </div>
    <div className={styles.formGrid}>
      <label className={rd.field}><span>Минимальная сумма заказа, ₽</span>
        <input className={rd.input} type="number" min={0} step={1} value={delivery.minOrder} onChange={(e) => setDelivery({ ...delivery, minOrder: Number(e.target.value) })} />
      </label>
      <label className={rd.field}><span>Часовой пояс ресторана</span>
        <select className={rd.input} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
          {TIMEZONES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
    </div>
    {dirty && <div className={styles.saveBar}>
      <button type="button" className={`${rd.btn} ${rd.btnPrimary}`} disabled={pending} onClick={save}>{pending ? "Сохраняю…" : "Сохранить"}</button>
      {status && <span role={status.error ? "alert" : "status"} className={`${styles.saveStatus}${status.error ? ` ${styles.error}` : ""}`} style={status.error ? {} : { color: "var(--rd-success)" }}>{status.text}</span>}
    </div>}
    {status && !dirty && <p className={rd.saved} role="status">{status.text}</p>}
  {revControl}</section>;
}
