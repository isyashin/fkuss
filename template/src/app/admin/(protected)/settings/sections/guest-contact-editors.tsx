"use client";

import { useState, useTransition } from "react";
import { useSettingsSave, useSettingsEpoch, useResetSettingsOnEpoch } from "../use-settings-save";
import { saveGuestContactChannels, saveSettings } from "../actions";
import type { ContentSettings } from "@/lib/content-schema";
import { visibleGuestChannels } from "@/lib/guest-contact";
import rd from "../../admin-redesign.module.css";
import styles from "../settings-redesign.module.css";

/** Связь с гостем: ручные ссылки в заказах/бронях. */
export function GuestContactEditor({ settings }: { settings: ContentSettings }) {
  const [contact, setContact] = useState(visibleGuestChannels(settings));
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const { save: saveWithRev, control: revControl } = useSettingsSave();
  // P1-2: после «Обновить» берём свежие данные.
  const settingsEpoch = useSettingsEpoch();
  useResetSettingsOnEpoch(settingsEpoch, () => {
    setContact(visibleGuestChannels(settings));
    setStatus(null);
  });

  function toggle(channel: "whatsapp" | "telegram", enabled: boolean) {
    const previous = contact;
    const next = { ...previous, [channel]: enabled };
    setContact(next);
    startTransition(async () => {
      setStatus(null);
      try {
        await saveGuestContactChannels(next);
        setStatus({ text: "Сохранено", error: false });
      } catch (cause) {
        setContact(previous);
        setStatus({ text: cause instanceof Error ? cause.message : "Не удалось сохранить каналы связи", error: true });
      }
    });
  }

  return <section className={styles.editorCard} aria-label="Связь с гостем">
    <h2 className={styles.editorTitle}>Связь с гостем</h2>
    <p className={styles.editorHint}>Ручные ссылки в заказах и бронях. Если выбранный гостем канал скрыт, сотрудник видит только номер телефона.</p>
    <div className={styles.toggleList}>
      <label className={styles.toggleRow}><input type="checkbox" checked={contact.whatsapp} disabled={pending} onChange={(e) => toggle("whatsapp", e.target.checked)} />WhatsApp</label>
      <label className={styles.toggleRow}><input type="checkbox" checked={contact.telegram} disabled={pending} onChange={(e) => toggle("telegram", e.target.checked)} />Telegram</label>
    </div>
    {status && <p role={status.error ? "alert" : "status"} className={status.error ? styles.saveStatus : rd.saved} style={status.error ? { color: "var(--rd-danger)" } : {}}>{status.text}</p>}
  {revControl}</section>;
}

/** Каналы уведомлений: куда отправлять сообщения о заказах и бронях. */
export function NotifyChannelsEditor({ settings }: { settings: ContentSettings }) {
  const [channels, setChannels] = useState(settings.channels);
  const [saved, setSaved] = useState(settings.channels);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const { save: saveWithRev, control: revControl } = useSettingsSave();
  // F21: сохранение появляется только при изменениях.
  const dirty = JSON.stringify(channels) !== JSON.stringify(saved);
  // P1-2: после «Обновить» берём свежие данные.
  const settingsEpoch = useSettingsEpoch();
  useResetSettingsOnEpoch(settingsEpoch, () => {
    setChannels(settings.channels);
    setSaved(settings.channels);
    setStatus(null);
  });

  function toggle(key: "telegram" | "max" | "email" | "whatsapp", enabled: boolean) {
    setChannels((current) => ({ ...current, [key]: { ...current[key], enabled } }));
  }
  function setField(key: "telegram" | "max" | "email" | "whatsapp", field: "chatId" | "address" | "phone", value: string) {
    setChannels((current) => ({ ...current, [key]: { ...current[key], [field]: value } }));
  }

  function save() {
    startTransition(async () => {
      setStatus(null);
      try {
        const next: ContentSettings = { ...settings, channels };
        const revResult = await saveWithRev(next); if (revResult !== "ok") { if (revResult === "error") throw new Error("Не удалось сохранить"); return; }
        setSaved(channels);
        setStatus({ text: "Сохранено", error: false });
      } catch (cause) {
        setStatus({ text: cause instanceof Error ? cause.message : "Не удалось сохранить", error: true });
      }
    });
  }

  return <section className={styles.editorCard} aria-label="Каналы уведомлений">
    <h2 className={styles.editorTitle}>Каналы уведомлений</h2>
    <p className={styles.editorHint}>Куда отправлять сообщения о заказах и бронированиях. Токены ботов — в настройках среды сайта.</p>
    <div className={styles.toggleList}>
      <label className={styles.toggleRow}><input type="checkbox" checked={channels.telegram.enabled} onChange={(e) => toggle("telegram", e.target.checked)} />Telegram</label>
      <label className={styles.toggleRow}><input type="checkbox" checked={channels.max.enabled} onChange={(e) => toggle("max", e.target.checked)} />MAX</label>
      <label className={styles.toggleRow}><input type="checkbox" checked={channels.email.enabled} onChange={(e) => toggle("email", e.target.checked)} />Email</label>
      <label className={styles.toggleRow}><input type="checkbox" checked={channels.whatsapp.enabled} onChange={(e) => toggle("whatsapp", e.target.checked)} />WhatsApp</label>
    </div>
    {/* F16: поле канала заблокировано вместе с подписью, пока канал выключен */}
    <div className={styles.formGrid}>
      <fieldset disabled={!channels.telegram.enabled} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <label className={rd.field}><span>Chat ID Telegram</span>
          <input className={rd.input} value={channels.telegram.chatId} onChange={(e) => setField("telegram", "chatId", e.target.value)} placeholder="chat_id группы" />
        </label>
      </fieldset>
      <fieldset disabled={!channels.max.enabled} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <label className={rd.field}><span>Chat ID MAX</span>
          <input className={rd.input} value={channels.max.chatId} onChange={(e) => setField("max", "chatId", e.target.value)} placeholder="chat_id чата MAX" />
        </label>
      </fieldset>
      <fieldset disabled={!channels.email.enabled} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <label className={rd.field}><span>Email для заказов</span>
          <input className={rd.input} value={channels.email.address} onChange={(e) => setField("email", "address", e.target.value)} placeholder="orders@example.ru" />
        </label>
      </fieldset>
      <fieldset disabled={!channels.whatsapp.enabled} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <label className={rd.field}><span>WhatsApp для сайта</span>
          <input className={rd.input} value={channels.whatsapp.phone} onChange={(e) => setField("whatsapp", "phone", e.target.value)} placeholder="+79991234567" />
        </label>
      </fieldset>
    </div>
    {dirty && (
    <div className={styles.saveBar}>
      <button type="button" className={`${rd.btn} ${rd.btnPrimary}`} disabled={pending} onClick={save}>{pending ? "Сохраняю…" : "Сохранить"}</button>
      {status && <span role={status.error ? "alert" : "status"} className={`${styles.saveStatus}${status.error ? ` ${styles.error}` : ""}`} style={status.error ? {} : { color: "var(--rd-success)" }}>{status.text}</span>}
    </div>
    )}
    {!dirty && status && <p className={rd.saved} role="status">{status.text}</p>}
  {revControl}</section>;
}
