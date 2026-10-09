"use client";

import { useState, useTransition } from "react";
import { useSettingsSave } from "../use-settings-save";
import { savePricing } from "../actions";
import type { ContentSettings } from "@/lib/content-schema";
import type { ThemeConfig } from "@/lib/content";
import rd from "../../admin-redesign.module.css";
import styles from "../settings-redesign.module.css";

/** Оплата и бонусы: провайдер оплаты + программа лояльности. */
export function PaymentLoyaltyEditor({ settings, theme }: { settings: ContentSettings; theme: ThemeConfig }) {
  const [payment, setPayment] = useState(settings.payment);
  const [loyalty, setLoyalty] = useState(settings.loyalty);
  const [saved, setSaved] = useState({ payment: settings.payment, loyalty: settings.loyalty });
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const { save: saveWithRev, control: revControl } = useSettingsSave();
  const dirty = JSON.stringify(payment) !== JSON.stringify(saved.payment) || JSON.stringify(loyalty) !== JSON.stringify(saved.loyalty);

  function save() {
    startTransition(async () => {
      setStatus(null);
      try {
        const next: ContentSettings = { ...settings, payment, loyalty };
        const revResult = await saveWithRev(next);
        if (revResult !== "ok") { if (revResult === "error") throw new Error("Не удалось сохранить"); return; }
        setSaved({ payment, loyalty });
        setStatus({ text: "Сохранено", error: false });
      } catch (cause) {
        setStatus({ text: cause instanceof Error ? cause.message : "Не удалось сохранить", error: true });
      }
    });
  }

  return <section className={styles.editorCard} aria-label="Оплата и бонусы">
    <h2 className={styles.editorTitle}>Оплата и бонусы</h2>
    <p className={styles.editorHint}>Онлайн-оплата и программа лояльности гостей.</p>
    <div className={styles.formGrid}>
      <label className={rd.field}><span>Онлайн-оплата заказов</span>
        <select className={rd.input} value={payment.provider} onChange={(e) => setPayment({ ...payment, provider: e.target.value as typeof payment.provider })}>
          <option value="none">выключена (только при получении)</option>
          <option value="mock">тестовый провайдер</option>
          <option value="yookassa">ЮKassa</option>
        </select>
      </label>
      <span />
      <label className={rd.field}><span>Кэшбэк, %</span>
        <input className={rd.input} type="number" min={0} max={100} value={loyalty.cashbackPercent} onChange={(e) => setLoyalty({ ...loyalty, cashbackPercent: Number(e.target.value) })} />
      </label>
      <label className={rd.field}><span>Списание бонусов до, %</span>
        <input className={rd.input} type="number" min={0} max={100} value={loyalty.maxSpendPercent} onChange={(e) => setLoyalty({ ...loyalty, maxSpendPercent: Number(e.target.value) })} />
      </label>
    </div>
    <p className={styles.note}>Ключи провайдера хранятся в настройках среды сайта.</p>
    {dirty && <div className={styles.saveBar}>
      <button type="button" className={`${rd.btn} ${rd.btnPrimary}`} disabled={pending} onClick={save}>{pending ? "Сохраняю…" : "Сохранить"}</button>
      {status && <span role={status.error ? "alert" : "status"} className={`${styles.saveStatus}${status.error ? ` ${styles.error}` : ""}`} style={status.error ? {} : { color: "var(--rd-success)" }}>{status.text}</span>}
    </div>}
    {status && !dirty && <p className={rd.saved} role="status">{status.text}</p>}
  {revControl}</section>;
}

/** Правила цен: общий режим цен меню. */
export function PricingEditor({ settings, theme }: { settings: ContentSettings; theme: ThemeConfig }) {
  const [mode, setMode] = useState(settings.pricing.globalMode);
  const [percent, setPercent] = useState(settings.pricing.globalPercent);
  const [saved, setSaved] = useState({ mode: settings.pricing.globalMode, percent: settings.pricing.globalPercent });
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const { save: saveWithRev, control: revControl } = useSettingsSave<typeof savePricing extends (input: infer T, ...args: never[]) => Promise<void> ? T : never>(savePricing);
  const dirty = mode !== saved.mode || percent !== saved.percent;

  function save() {
    startTransition(async () => {
      setStatus(null);
      try {
        const pricing = { globalMode: mode, globalPercent: percent };
        const revResult = await saveWithRev(pricing);
        if (revResult !== "ok") { if (revResult === "error") throw new Error("Не удалось сохранить"); return; }
        setSaved({ mode, percent });
        setStatus({ text: "Сохранено", error: false });
      } catch (cause) {
        setStatus({ text: cause instanceof Error ? cause.message : "Не удалось сохранить", error: true });
      }
    });
  }

  return <section className={styles.editorCard} aria-label="Правила цен">
    <h2 className={styles.editorTitle}>Правила цен</h2>
    <p className={styles.editorHint}>Общий режим цен меню. Индивидуальный режим блюда приоритетнее; коэффициент действует и на платные добавки без ручной цены.</p>
    <div className={styles.formGrid}>
      <label className={rd.field}><span>Режим цен меню</span>
        <select className={rd.input} value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
          <option value="yandex">Цена Яндекс.Еды</option>
          <option value="manual">Ручные цены</option>
          <option value="coefficient">Яндекс ± %</option>
        </select>
      </label>
      <label className={rd.field}><span>Коэффициент, %</span>
        <input className={rd.input} type="number" value={percent} disabled={mode !== "coefficient"} onChange={(e) => setPercent(Number(e.target.value))} />
      </label>
    </div>
    {dirty && <div className={styles.saveBar}>
      <button type="button" className={`${rd.btn} ${rd.btnPrimary}`} disabled={pending} onClick={save}>{pending ? "Сохраняю…" : "Сохранить"}</button>
      {status && <span role={status.error ? "alert" : "status"} className={`${styles.saveStatus}${status.error ? ` ${styles.error}` : ""}`} style={status.error ? {} : { color: "var(--rd-success)" }}>{status.text}</span>}
    </div>}
    {status && !dirty && <p className={rd.saved} role="status">{status.text}</p>}
  {revControl}</section>;
}

/** Параметры бронирования. */
export function BookingEditor({ settings }: { settings: ContentSettings }) {
  const [booking, setBooking] = useState(settings.booking);
  const [saved, setSaved] = useState(settings.booking);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);
  const { save: saveWithRev, control: revControl } = useSettingsSave();
  const dirty = JSON.stringify(booking) !== JSON.stringify(saved);

  function save() {
    startTransition(async () => {
      setStatus(null);
      try {
        const next: ContentSettings = { ...settings, booking };
        const revResult = await saveWithRev(next); if (revResult !== "ok") { if (revResult === "error") throw new Error("Не удалось сохранить"); return; }
        setSaved(booking);
        setStatus({ text: "Сохранено", error: false });
      } catch (cause) {
        setStatus({ text: cause instanceof Error ? cause.message : "Не удалось сохранить", error: true });
      }
    });
  }

  return <section className={styles.editorCard} aria-label="Параметры бронирования">
    <h2 className={styles.editorTitle}>Бронирование</h2>
    <p className={styles.editorHint}>Условия создания брони на сайте.</p>
    <div className={styles.toggleList}>
      <label className={styles.toggleRow}><input type="checkbox" checked={booking.enabled} onChange={(e) => setBooking({ ...booking, enabled: e.target.checked })} />Бронирование включено</label>
    </div>
    {booking.enabled && (
      <div className={styles.formGrid} style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
        <label className={rd.field}><span>Шаг слота, мин</span>
          <input className={rd.input} type="number" min={15} max={180} value={booking.slotMinutes} onChange={(e) => setBooking({ ...booking, slotMinutes: Number(e.target.value) })} />
        </label>
        <label className={rd.field}><span>Гостей на слот, макс</span>
          <input className={rd.input} type="number" min={1} value={booking.maxGuestsPerSlot} onChange={(e) => setBooking({ ...booking, maxGuestsPerSlot: Number(e.target.value) })} />
        </label>
        <label className={rd.field}><span>Не раньше, ч.</span>
          <input className={rd.input} type="number" min={0} value={booking.minHoursAhead} onChange={(e) => setBooking({ ...booking, minHoursAhead: Number(e.target.value) })} />
        </label>
      </div>
    )}
    {dirty && <div className={styles.saveBar}>
      <button type="button" className={`${rd.btn} ${rd.btnPrimary}`} disabled={pending} onClick={save}>{pending ? "Сохраняю…" : "Сохранить"}</button>
      {status && <span role={status.error ? "alert" : "status"} className={`${styles.saveStatus}${status.error ? ` ${styles.error}` : ""}`} style={status.error ? {} : { color: "var(--rd-success)" }}>{status.text}</span>}
    </div>}
    {status && !dirty && <p className={rd.saved} role="status">{status.text}</p>}
  {revControl}</section>;
}
