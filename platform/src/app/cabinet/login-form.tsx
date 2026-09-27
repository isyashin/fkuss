"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestCodeAction, verifyCodeAction } from "./actions";

export function OwnerLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {step === "email" ? (
        <>
          <label>
            Email
            <input type="email" value={email} inputMode="email" autoComplete="email"
              onChange={(e) => setEmail(e.target.value)} placeholder="you@example.ru" className="pf-input" />
          </label>
          {error && <p role="alert" style={{ color: "var(--pf-red)", fontSize: 13, margin: 0 }}>{error}</p>}
          <button type="button" className="pf-btn pf-btnPrimary" disabled={sending || !email.includes("@")}
            onClick={async () => {
              setSending(true);
              setError("");
              const result = await requestCodeAction(email);
              setSending(false);
              if (result.error) { setError(result.error); return; }
              if (result.devCode) setDevCode(result.devCode);
              setStep("code");
            }}>
            {sending ? "Отправляю…" : "Получить код"}
          </button>
        </>
      ) : (
        <>
          <p className="pf-note" style={{ margin: 0 }}>
            Код отправлен на {email}.
            {devCode && <span style={{ display: "block", fontFamily: "monospace", color: "var(--pf-accent)" }}>DEV: {devCode}</span>}
          </p>
          <label>
            Код из письма
            <input inputMode="numeric" maxLength={6} autoComplete="one-time-code" value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="pf-input" style={{ textAlign: "center", fontSize: 22, letterSpacing: "0.5em", fontFamily: "monospace" }} />
          </label>
          {error && <p role="alert" style={{ color: "var(--pf-red)", fontSize: 13, margin: 0 }}>{error}</p>}
          <button type="button" className="pf-btn pf-btnPrimary" disabled={sending || code.length !== 6}
            onClick={async () => {
              setSending(true);
              setError("");
              const result = await verifyCodeAction(email, code);
              setSending(false);
              if (result.ok) router.refresh();
              else setError(result.reason ?? "Ошибка");
            }}>
            {sending ? "Проверяю…" : "Войти"}
          </button>
          <button type="button" className="pf-btn pf-btnGhost" onClick={() => setStep("email")}>Изменить email</button>
        </>
      )}
    </div>
  );
}
