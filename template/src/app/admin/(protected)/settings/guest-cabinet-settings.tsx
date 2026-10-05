"use client";

import { useState } from "react";
import type { GuestCabinetSettings } from "@/lib/guest-cabinet";
import styles from "./settings-admin.module.css";
import { AdminIcon } from "../admin-icon";

/**
 * Карточка «Личный кабинет гостя»: вкл/выкл, режим кода входа, SMTP.
 * Хранение и тест письма — /api/admin/guest-cabinet.
 */
export function GuestCabinetSettings({ initial }: { initial: GuestCabinetSettings }) {
  const [cabinet, setCabinet] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function patch(body: Partial<GuestCabinetSettings>) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/guest-cabinet", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Не удалось сохранить");
      setCabinet(data as GuestCabinetSettings);
      setMessage("Сохранено");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка сохранения");
    } finally { setBusy(false); }
  }

  async function sendTest() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/admin/guest-cabinet", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Не удалось отправить");
      setMessage("Тестовое письмо отправлено на адрес email-уведомлений");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка отправки");
    } finally { setBusy(false); }
  }

  const status = !cabinet.enabled
    ? "Кабинет выключен: вход гостей недоступен, бонусы и история заказов скрыты."
    : cabinet.authMode === "screen"
      ? "Код входа будет показываться на экране (без отправки email)."
      : "Код входа будет отправляться гостю по email.";

  return (
    <section className={styles.card} aria-label="Личный кабинет гостя">
      <div className={styles.soundHead}>
        <div><h2>Личный кабинет гостя</h2><p>Бонусы, история заказов и броней, адреса</p></div>
        <AdminIcon name="sound" size={20} />
      </div>

      <div className={styles.soundRow}>
        <label>
          <input
            type="checkbox"
            checked={cabinet.enabled}
            disabled={busy}
            onChange={(e) => void patch({ enabled: e.target.checked })}
          />
          <span>Кабинет включён</span>
        </label>
      </div>

      {cabinet.enabled && (
        <>
          <p className={styles.cardHint}>Как гость получает код входа:</p>
          <div className={styles.soundRow}>
            <label>
              <input type="radio" name="gc-auth" checked={cabinet.authMode === "screen"} disabled={busy}
                onChange={() => void patch({ authMode: "screen" })} />
              <span>Показывать код на экране</span>
            </label>
          </div>
          <div className={styles.soundRow}>
            <label>
              <input type="radio" name="gc-auth" checked={cabinet.authMode === "email"} disabled={busy}
                onChange={() => void patch({ authMode: "email" })} />
              <span>Отправлять код на email</span>
            </label>
          </div>

          {cabinet.authMode === "email" && (
            <>
              <p className={styles.cardHint}>SMTP для кодов входа и уведомлений (если пусто — используется настройка сервера):</p>
              <label className="block mb-2">
                <span className="text-sm text-muted">SMTP URL</span>
                <input
                  value={cabinet.smtpUrl}
                  disabled={busy}
                  placeholder="smtps://user:password@smtp.example.ru:465"
                  onChange={(e) => setCabinet({ ...cabinet, smtpUrl: e.target.value })}
                  className="mt-1 w-full"
                  autoComplete="off"
                />
              </label>
              <label className="block mb-2">
                <span className="text-sm text-muted">Отправитель (From)</span>
                <input
                  value={cabinet.smtpFrom}
                  disabled={busy}
                  placeholder="Ресторан <no-reply@example.ru>"
                  onChange={(e) => setCabinet({ ...cabinet, smtpFrom: e.target.value })}
                  className="mt-1 w-full"
                  autoComplete="off"
                />
              </label>
              <div className={styles.sectionActions}>
                <button type="button" className={styles.saveButton} disabled={busy}
                  onClick={() => void patch({ smtpUrl: cabinet.smtpUrl, smtpFrom: cabinet.smtpFrom })}>
                  Сохранить SMTP
                </button>
                <button type="button" className={styles.outlineButton} disabled={busy} onClick={() => void sendTest()}>
                  Отправить тестовое письмо
                </button>
              </div>
            </>
          )}
        </>
      )}

      <p className={styles.soundHint} role="status">{status}</p>
      {message && <p className={styles.soundHint} role="status">{message}</p>}
    </section>
  );
}
