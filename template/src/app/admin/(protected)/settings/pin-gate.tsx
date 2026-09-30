"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import styles from "./pin-gate.module.css";

const MAX_DIGITS = 6;

/** Экран ввода PIN владельца: визуальная панель + физическая клавиатура. */
export function PinGate() {
  const router = useRouter();
  const [digits, setDigits] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [pending, startTransition] = useTransition();
  const busyRef = useRef(false);

  async function submit(pin: string) {
    if (busyRef.current) return;
    busyRef.current = true;
    setError("");
    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/pin-unlock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pin }),
        });
        const data = await response.json();
        if (response.ok) {
          router.refresh();
          return;
        }
        setError(data.error ?? "Неверный PIN");
        setShake(true);
        setTimeout(() => setShake(false), 400);
        setDigits("");
      } catch {
        setError("Нет связи. Попробуйте ещё раз.");
      } finally {
        busyRef.current = false;
      }
    });
  }

  function press(key: string) {
    if (pending) return;
    if (key === "back") {
      setDigits((value) => value.slice(0, -1));
      return;
    }
    setDigits((value) => {
      if (value.length >= MAX_DIGITS) return value;
      const next = value + key;
      if (next.length === MAX_DIGITS) setTimeout(() => submit(next), 120);
      return next;
    });
  }

  // Физическая клавиатура: цифры, Backspace, Enter.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (pending) return;
      if (/^\d$/.test(event.key)) press(event.key);
      else if (event.key === "Backspace") press("back");
      else if (event.key === "Enter" && digits.length >= 4) submit(digits);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className={`${styles.pinPage} ${shake ? styles.shake : ""}`}>
      <span className={styles.pinEyebrow}>Раздел владельца</span>
      <h1>Введите PIN</h1>
      <p className={styles.pinLead}>
        «Настройки» и остальные разделы владельца открываются PIN-кодом. Узнайте его у владельца ресторана.
      </p>

      <div className={`${styles.pinDots} ${error ? styles.error : ""}`} aria-label={`Введено цифр: ${digits.length}`}>
        {Array.from({ length: MAX_DIGITS }, (_, index) => (
          <span key={index} className={index < digits.length ? styles.filled : ""} />
        ))}
      </div>

      <div className={styles.pinPad} role="group" aria-label="PIN-панель">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((key) => (
          <button key={key} type="button" className={styles.pinKey} disabled={pending} onClick={() => press(key)}
            aria-label={`Цифра ${key}`}>
            {key}
          </button>
        ))}
        <button type="button" className={styles.pinKey} disabled={pending} onClick={() => setDigits("")} aria-label="Очистить">
          C
        </button>
        <button type="button" className={styles.pinKey} disabled={pending} onClick={() => press("0")} aria-label="Цифра 0">
          0
        </button>
        <button type="button" className={styles.pinKey} disabled={pending} onClick={() => press("back")} aria-label="Стереть">
          ⌫
        </button>
      </div>

      <div className={styles.pinActions}>
        <button type="button" className={styles.pinUnlock} disabled={pending || digits.length < 4} onClick={() => submit(digits)}>
          {pending ? "Проверяю…" : "Разблокировать"}
        </button>
        <a className={styles.pinGhost} href="/admin" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
          Назад
        </a>
      </div>

      <p className={styles.pinError} role="alert">{error}</p>
      <p className={styles.pinHint}>Можно вводить с клавиатуры: цифры, Enter — подтвердить, Backspace — стереть.</p>
    </div>
  );
}
