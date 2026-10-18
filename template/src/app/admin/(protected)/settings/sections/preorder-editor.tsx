"use client";

import { useDirtyGuard } from "../../admin-dirty";

import { useState, useTransition } from "react";
import { useSettingsSave, useSettingsEpoch, useResetSettingsOnEpoch } from "../use-settings-save";
import { savePreOrder } from "../actions";
import type { ContentSettings } from "@/lib/content-schema";
import type { PreOrderSettings } from "@/lib/order/preorder";
import { coerceSlotTime } from "@/lib/order/preorder";
import rd from "../../admin-redesign.module.css";
import styles from "../settings-redesign.module.css";

/** Предзаказ ко времени: слоты и окно в чекауте (самовывоз и доставка без вариантов). */
export function PreOrderEditor({ settings }: { settings: ContentSettings }) {
  const [preOrder, setPreOrder] = useState(settings.preOrder);
  const [saved, setSaved] = useState(settings.preOrder);
  const [draft, setDraft] = useState("");
  const [slotError, setSlotError] = useState("");
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const { save: saveWithRev, control: revControl } = useSettingsSave<PreOrderSettings>(savePreOrder);
  const settingsEpoch = useSettingsEpoch();
  useResetSettingsOnEpoch(settingsEpoch, () => {
    setPreOrder(settings.preOrder);
    setSaved(settings.preOrder);
    setDraft("");
    setSlotError("");
    setStatus(null);
  });
  const dirty = JSON.stringify(preOrder) !== JSON.stringify(saved);
  useDirtyGuard(dirty || draft.trim() !== "");

  function addSlot() {
    const time = coerceSlotTime(draft);
    if (!time) { setSlotError("Время в формате ЧЧ:ММ, например 12:30"); return; }
    if (preOrder.slots.includes(time)) { setSlotError("Такой слот уже есть"); return; }
    setSlotError("");
    setPreOrder({ ...preOrder, slots: [...preOrder.slots, time].sort() });
    setDraft("");
  }

  function save() {
    startTransition(async () => {
      setStatus(null);
      const revResult = await saveWithRev(preOrder);
      if (revResult === "conflict") return;
      if (revResult === "error") { setStatus({ text: "Не удалось сохранить", error: true }); return; }
      setSaved(preOrder);
      setStatus({ text: "Сохранено", error: false });
    });
  }

  return <section className={styles.editorCard} aria-label="Предзаказ">
    <h2 className={styles.editorTitle}>Предзаказ</h2>
    <p className={styles.editorHint}>Гость выберет дату и время получения в чекауте. Работает для самовывоза и доставки без настроенных вариантов.</p>
    <div className={styles.toggleList}>
      <label className={styles.toggleRow}><input type="checkbox" checked={preOrder.enabled} onChange={(e) => setPreOrder({ ...preOrder, enabled: e.target.checked })} />Предзаказ ко времени включён</label>
    </div>
    <div className={styles.formGrid}>
      <label className={rd.field}><span>На сколько суток вперёд предлагать слоты</span>
        <input className={rd.input} type="number" min={0} max={14} step={1} value={preOrder.daysAhead} onChange={(e) => setPreOrder({ ...preOrder, daysAhead: Math.min(14, Math.max(0, Math.floor(Number(e.target.value) || 0))) })} />
      </label>
      <label className={rd.field}><span>Минимальный запас от «сейчас», минут</span>
        <input className={rd.input} type="number" min={0} step={5} value={preOrder.minAheadMinutes} onChange={(e) => setPreOrder({ ...preOrder, minAheadMinutes: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} />
      </label>
    </div>
    <div>
      <span className={styles.slotLabel}>Слоты (время начала)</span>
      {preOrder.slots.length === 0 && <p className={styles.note}>Слоты не заданы — предзаказ не предлагается.</p>}
      {preOrder.slots.map((time, index) => (
        <div key={time} className={styles.slotRow}>
          <input className={rd.input} type="time" value={time} aria-label={`Слот ${index + 1}`}
            onChange={(e) => {
              const next = coerceSlotTime(e.target.value);
              if (!next || preOrder.slots.includes(next)) return;
              setPreOrder({ ...preOrder, slots: preOrder.slots.map((s, i) => (i === index ? next : s)).sort() });
            }} />
          <button type="button" className={`${rd.btn} ${styles.slotRemove}`} aria-label={`Удалить слот ${time}`}
            onClick={() => setPreOrder({ ...preOrder, slots: preOrder.slots.filter((_, i) => i !== index) })}>✕</button>
        </div>
      ))}
      <div className={styles.slotRow}>
        <input className={rd.input} type="time" value={draft} aria-label="Новый слот"
          onChange={(e) => { setDraft(e.target.value); setSlotError(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSlot(); } }} />
        <button type="button" className={`${rd.btn} ${styles.slotRemove}`} onClick={addSlot} disabled={pending}>+</button>
      </div>
      {slotError && <p role="alert" className={`${styles.saveStatus} ${styles.error}`}>{slotError}</p>}
    </div>
    {dirty && <div className={styles.saveBar} data-dirty>
      <button type="button" className={`${rd.btn} ${rd.btnPrimary}`} disabled={pending} onClick={save}>{pending ? "Сохраняю…" : "Сохранить"}</button>
      {status && <span role={status.error ? "alert" : "status"} className={`${styles.saveStatus}${status.error ? ` ${styles.error}` : ""}`} style={status.error ? {} : { color: "var(--rd-success)" }}>{status.text}</span>}
    </div>}
    {status && !dirty && <p className={rd.saved} role="status">{status.text}</p>}
  {revControl}</section>;
}
