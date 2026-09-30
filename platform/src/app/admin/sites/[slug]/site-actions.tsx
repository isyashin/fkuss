"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adjustBalance, setSiteState, setTariff } from "./actions";

export function SiteActions({
  slug,
  tariffs,
  currentTariff,
  state,
}: {
  slug: string;
  tariffs: { id: string; name: string; monthlyPrice: number }[];
  currentTariff: string | null;
  state: string;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="pf-actionsRow">
        <select
          defaultValue={currentTariff ?? ""}
          onChange={(e) => startTransition(async () => { await setTariff(slug, e.target.value || null); router.refresh(); })}
          className="pf-select"
          style={{ width: "auto", minWidth: 220 }}
          aria-label="Тариф сайта"
        >
          <option value="">без тарифа</option>
          {tariffs.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} — {t.monthlyPrice} ₽/мес
            </option>
          ))}
        </select>

        {state !== "suspended" ? (
          <button
            type="button"
            disabled={pending}
            className="pf-btn pf-btnDanger"
            onClick={() => {
              const c = prompt("Причина приостановки:");
              if (c) startTransition(async () => { await setSiteState(slug, "suspended", c); router.refresh(); });
            }}
          >
            Приостановить
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            className="pf-btn pf-btnOutline"
            onClick={() => {
              const c = prompt("Причина реактивации:");
              if (c) startTransition(async () => { await setSiteState(slug, "active", c); router.refresh(); });
            }}
          >
            Реактивировать
          </button>
        )}
      </div>

      <div className="pf-actionsRow">
        <input
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Сумма ₽ (+/−)"
          aria-label="Сумма корректировки"
          className="pf-input"
          style={{ width: 150 }}
        />
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Комментарий (обязателен)"
          aria-label="Комментарий"
          className="pf-input"
          style={{ flex: "1 1 220px" }}
        />
        <button
          type="button"
          disabled={pending || !amount || !comment}
          className="pf-btn pf-btnPrimary"
          onClick={() =>
            startTransition(async () => {
              await adjustBalance(slug, Number(amount), comment);
              setAmount("");
              setComment("");
              setMessage("Записано ✓");
              setTimeout(() => setMessage(""), 3000);
              router.refresh();
            })
          }
        >
          Провести
        </button>
        {message && <span className="pf-note" role="status">{message}</span>}
      </div>
    </div>
  );
}
