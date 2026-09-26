"use client";

import { useState, useTransition } from "react";
import { topupAction } from "./actions";
import styles from "./topup-form.module.css";

export function TopupForm() {
  const [amount, setAmount] = useState("1000");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  return (
    <div className={styles.form}>
      <label htmlFor="billing-topup-amount">Сумма пополнения, ₽</label>
      <input
        id="billing-topup-amount"
        type="number"
        min={100}
        step={100}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className={styles.input}
      />
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError("");
            const result = await topupAction(Number(amount));
            if (result.confirmationUrl) {
              window.location.href = result.confirmationUrl;
            } else {
              setError(result.error ?? "Ошибка");
            }
          })
        }
        className={styles.button}
      >
        {pending ? "…" : "Пополнить баланс"}
      </button>
      {error && <span className={styles.error} role="alert">{error}</span>}
    </div>
  );
}
