"use client";

import { useState, useTransition } from "react";
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
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  const inputCls = "min-h-11 px-3 rounded-lg border border-zinc-300 bg-white";

  return (
    <section className="bg-zinc-50 rounded-xl border border-zinc-200 p-4 space-y-4">
      <h2 className="text-xl">Операции</h2>

      <div className="flex flex-wrap gap-2 items-center">
        <select
          defaultValue={currentTariff ?? ""}
          onChange={(e) => startTransition(() => setTariff(slug, e.target.value || null))}
          className={inputCls}
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
            disabled={pending}
            onClick={() => {
              const c = prompt("Причина приостановки:");
              if (c) startTransition(() => setSiteState(slug, "suspended", c));
            }}
            className="min-h-11 px-4 rounded-full border border-red-300 text-red-600 text-sm"
          >
            Приостановить
          </button>
        ) : (
          <button
            disabled={pending}
            onClick={() => {
              const c = prompt("Причина реактивации:");
              if (c) startTransition(() => setSiteState(slug, "active", c));
            }}
            className="min-h-11 px-4 rounded-full bg-green-600 text-white text-sm"
          >
            Реактивировать
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="number"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Сумма ₽ (+/−)"
          className={`${inputCls} w-40`}
        />
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Комментарий (обязателен)"
          className={`${inputCls} flex-1 min-w-48`}
        />
        <button
          disabled={pending || !amount || !comment}
          onClick={() =>
            startTransition(async () => {
              await adjustBalance(slug, Number(amount), comment);
              setAmount("");
              setComment("");
              setMessage("Записано ✓");
              setTimeout(() => setMessage(""), 3000);
            })
          }
          className="min-h-11 px-5 rounded-full bg-zinc-900 text-white text-sm font-medium disabled:opacity-50"
        >
          Провести
        </button>
        {message && <span className="text-green-600 text-sm">{message}</span>}
      </div>
    </section>
  );
}
