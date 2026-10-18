"use client";

import { useDirtyGuard } from "../../admin-dirty";

import { useState, useTransition } from "react";
import { useSettingsSave, useSettingsEpoch, useResetSettingsOnEpoch } from "../use-settings-save";
import { saveSettings } from "../actions";
import type { ContentSettings } from "@/lib/content-schema";
import rd from "../../admin-redesign.module.css";
import styles from "../settings-redesign.module.css";

/** Доставка и самовывоз: общие условия. Зоны и geo-режим — этой же секцией (этап 3).
    Часовой пояс перенесён в раздел «Часы работы» (компоновка настроек 2026-10). */
export function DeliveryEditor({ settings }: { settings: ContentSettings }) {
  const [delivery, setDelivery] = useState(settings.delivery);
  const [saved, setSaved] = useState(settings.delivery);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const { save: saveWithRev, control: revControl, errorMessage } = useSettingsSave();
  // P1-2: после «Обновить» в диалоге конфликта редактор берёт свежие данные.
  const settingsEpoch = useSettingsEpoch();
  useResetSettingsOnEpoch(settingsEpoch, () => {
    setDelivery(settings.delivery);
    setSaved(settings.delivery);
    setStatus(null);
  });
  const dirty = JSON.stringify(delivery) !== JSON.stringify(saved);
  useDirtyGuard(dirty);

  function save() {
    startTransition(async () => {
      setStatus(null);
      try {
        const next: ContentSettings = { ...settings, delivery };
        const revResult = await saveWithRev(next); if (revResult !== "ok") { if (revResult === "error") throw new Error(errorMessage ?? "Не удалось сохранить"); return; }
        setSaved(delivery);
        setStatus({ text: "Сохранено", error: false });
      } catch (cause) {
        setStatus({ text: cause instanceof Error ? cause.message : "Не удалось сохранить", error: true });
      }
    });
  }

  return <section className={styles.editorCard} aria-label="Доставка и самовывоз">
    <h2 className={styles.editorTitle}>Доставка и самовывоз</h2>
    <div className={styles.toggleList}>
      <label className={styles.toggleRow}><input type="checkbox" checked={delivery.enabled} onChange={(e) => setDelivery({ ...delivery, enabled: e.target.checked })} />Доставка включена</label>
      <label className={styles.toggleRow}><input type="checkbox" checked={delivery.pickupEnabled} onChange={(e) => setDelivery({ ...delivery, pickupEnabled: e.target.checked })} />Самовывоз включён</label>
    </div>
    <div className={styles.formGrid}>
      <label className={rd.field}><span>Минимальная сумма для доставки, ₽</span>
        <input className={rd.input} type="number" min={0} step={1} value={delivery.minOrder} onChange={(e) => setDelivery({ ...delivery, minOrder: Number(e.target.value) })} />
      </label>
    </div>
    <div className={styles.saveBar} data-dirty={dirty || undefined}>
      <button type="button" className={`${rd.btn} ${rd.btnPrimary}`} disabled={pending || !dirty} onClick={save}>{pending ? "Сохраняю…" : "Сохранить"}</button>
      {status && <span role={status.error ? "alert" : "status"} className={`${styles.saveStatus}${status.error ? ` ${styles.error}` : ""}`} style={status.error ? {} : { color: "var(--rd-success)" }}>{status.text}</span>}
    </div>
    {status && !dirty && <p className={rd.saved} role="status">{status.text}</p>}
  {revControl}</section>;
}
