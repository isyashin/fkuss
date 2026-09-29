"use client";

import { useState, useTransition } from "react";
import { setOwnerPinAction } from "./owner-pin-actions";

/** PIN владельца сайта: просмотр и смена из админки платформы. */
export function OwnerPinPanel({ slug, initialPin }: { slug: string; initialPin: string | null }) {
  const [pin, setPin] = useState(initialPin ?? "");
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const generate = () => setPin(String(Math.floor(1000 + Math.random() * 9000)));

  return (
    <div style={{ display: "grid", gap: 10, maxWidth: 420 }}>
      <div className="pf-field">
        <span>Текущий PIN владельца (вход сотрудника во владельческие разделы сайта)</span>
        <input value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, "").slice(0, 6)); setSaved(false); }}
          className="pf-input" inputMode="numeric" placeholder="не задан" aria-label="PIN владельца" />
      </div>
      <div className="pf-actionsRow">
        <button type="button" className="pf-btn pf-btnPrimary" disabled={pending || !/^\d{4,6}$/.test(pin)}
          onClick={() => startTransition(async () => {
            setError("");
            const result = await setOwnerPinAction(slug, pin);
            if (result.ok) setSaved(true);
            else setError(result.error ?? "Не сохранилось");
          })}>
          {pending ? "Сохраняю…" : "Сохранить PIN"}
        </button>
        <button type="button" className="pf-btn pf-btnOutline" disabled={pending} onClick={generate}>
          Сгенерировать
        </button>
        {saved && <span className="pf-note" role="status">Сохранено ✓</span>}
        {error && <span role="alert" style={{ color: "var(--pf-red)", fontSize: 12 }}>{error}</span>}
      </div>
      {initialPin === null && (
        <p className="pf-note" role="status">PIN ещё не задан на сайте — сайт недоступен по сети или не отвечает.</p>
      )}
    </div>
  );
}
