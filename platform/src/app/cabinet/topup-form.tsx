"use client";

import { useState, useTransition } from "react";
import { topupAction } from "./topup-action";

export function TopupForm({ slug }: { slug: string }) {
  const [amount, setAmount] = useState("1000");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  return (
    <div className="flex gap-2 items-center">
      <input
        type="number"
        min={100}
        step={100}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-32 min-h-11 px-3 rounded-lg border border-zinc-300"
      />
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError("");
            const result = await topupAction(slug, Number(amount));
            if (result.confirmationUrl) {
              window.location.href = result.confirmationUrl;
            } else {
              setError(result.error ?? "Ошибка оплаты");
            }
          })
        }
        className="min-h-11 px-5 rounded-full bg-zinc-900 text-white text-sm font-medium disabled:opacity-50"
      >
        {pending ? "…" : "Пополнить"}
      </button>
      {error && <span className="text-red-600 text-sm">{error}</span>}
    </div>
  );
}
