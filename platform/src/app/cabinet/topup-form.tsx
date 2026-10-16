"use client";

import { useState, useTransition } from "react";
import { topupAction } from "./topup-action";
import { useMounted } from "@/lib/use-mounted";

export function TopupForm({ slug }: { slug: string }) {
  const mounted = useMounted();
  const [amount, setAmount] = useState("1000");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  return (
    <div className="pf-actionsRow">
      <input type="number" disabled={!mounted} min={100} step={100} value={amount} onChange={(e) => setAmount(e.target.value)}
        aria-label="Сумма пополнения" className="pf-input" style={{ width: 130 }} />
      <button type="button" className="pf-btn pf-btnPrimary" disabled={pending || !mounted}
        onClick={() =>
          startTransition(async () => {
            setError("");
            const result = await topupAction(slug, Number(amount));
            if (result.confirmationUrl) window.location.href = result.confirmationUrl;
            else setError(result.error ?? "Ошибка оплаты");
          })
        }>
        {pending ? "…" : "Пополнить"}
      </button>
      {error && <span role="alert" style={{ color: "var(--pf-red)", fontSize: 12 }}>{error}</span>}
    </div>
  );
}
