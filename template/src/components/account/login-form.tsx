"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  async function requestCode() {
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Ошибка отправки");
        return;
      }
      if (data.devCode) setDevCode(data.devCode); // dev-режим без SMTP
      setStep("code");
    } catch {
      setError("Нет связи. Попробуйте ещё раз.");
    } finally {
      setSending(false);
    }
  }

  async function verify() {
    setSending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Неверный код");
        return;
      }
      router.refresh();
    } catch {
      setError("Нет связи. Попробуйте ещё раз.");
    } finally {
      setSending(false);
    }
  }

  const inputCls = "mt-1 w-full min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15";

  return (
    <div className="space-y-4 max-w-sm">
      {step === "email" ? (
        <>
          <p className="text-muted">Введите email — пришлём одноразовый код входа.</p>
          <label className="block">
            <span className="text-sm text-muted">Email</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
            />
          </label>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            onClick={requestCode}
            disabled={sending || !email.includes("@")}
            className="w-full min-h-12 rounded-full bg-accent text-white font-medium disabled:opacity-50"
          >
            {sending ? "Отправляю…" : "Получить код"}
          </button>
        </>
      ) : (
        <>
          <p className="text-muted">
            Код отправлен на {email}.
            {devCode && <span className="block text-accent font-mono mt-1">DEV: {devCode}</span>}
          </p>
          <label className="block">
            <span className="text-sm text-muted">Код из письма</span>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className={`${inputCls} text-center text-2xl tracking-[0.5em] font-mono`}
            />
          </label>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            onClick={verify}
            disabled={sending || code.length !== 6}
            className="w-full min-h-12 rounded-full bg-accent text-white font-medium disabled:opacity-50"
          >
            {sending ? "Проверяю…" : "Войти"}
          </button>
          <button onClick={() => setStep("email")} className="w-full min-h-11 text-muted">
            Изменить email
          </button>
        </>
      )}
    </div>
  );
}
