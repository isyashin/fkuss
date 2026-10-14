"use client";

import { useState, useTransition } from "react";
import { useSettingsSave, useSettingsEpoch, useResetSettingsOnEpoch } from "../use-settings-save";
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

/** Часовой пояс ресторана — в разделе «Часы работы» (перенесён из «Доставки»). */
export function TimezoneEditor({ settings }: { settings: ContentSettings }) {
  const [timezone, setTimezone] = useState(settings.timezone);
  const [saved, setSaved] = useState(settings.timezone);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const { save: saveWithRev, control: revControl, errorMessage } = useSettingsSave();
  const settingsEpoch = useSettingsEpoch();
  useResetSettingsOnEpoch(settingsEpoch, () => {
    setTimezone(settings.timezone);
    setSaved(settings.timezone);
    setStatus(null);
  });
  const dirty = timezone !== saved;

  function save() {
    startTransition(async () => {
      setStatus(null);
      try {
        const next: ContentSettings = { ...settings, timezone };
        const revResult = await saveWithRev(next);
        if (revResult !== "ok") { if (revResult === "error") throw new Error(errorMessage ?? "Не удалось сохранить"); return; }
        setSaved(timezone);
        setStatus({ text: "Сохранено", error: false });
      } catch (cause) {
        setStatus({ text: cause instanceof Error ? cause.message : "Не удалось сохранить", error: true });
      }
    });
  }

  return <section className={styles.editorCard} aria-label="Часовой пояс ресторана">
    <h2 className={styles.editorTitle}>Часовой пояс ресторана</h2>
    <p className={styles.editorHint}>Единый для ресторана: влияет на слоты предзаказа, бронирование и время в заказах.</p>
    <div className={styles.formGrid}>
      <label className={rd.field}><span>Часовой пояс</span>
        <select className={rd.input} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
          {TIMEZONES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
    </div>
    <div className={styles.saveBar} data-dirty={dirty || undefined}>
      <button type="button" className={`${rd.btn} ${rd.btnPrimary}`} disabled={pending || !dirty} onClick={save}>{pending ? "Сохраняю…" : "Сохранить"}</button>
      {status && <span role={status.error ? "alert" : "status"} className={`${styles.saveStatus}${status.error ? ` ${styles.error}` : ""}`} style={status.error ? {} : { color: "var(--rd-success)" }}>{status.text}</span>}
    </div>
    {status && !dirty && <p className={rd.saved} role="status">{status.text}</p>}
  {revControl}</section>;
}
