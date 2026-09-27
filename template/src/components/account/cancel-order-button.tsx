"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelMyOrder } from "@/app/account/actions";
import styles from "./account.module.css";

export function CancelOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  return (
    <>
      <button type="button" className={styles.btn + " " + styles.btnDanger} disabled={pending}
        onClick={() => {
          if (!confirm("Отменить заказ?")) return;
          startTransition(async () => {
            setError("");
            const result = await cancelMyOrder(orderId);
            if (result.ok) router.refresh();
            else setError(result.error ?? "Не удалось отменить");
          });
        }}>
        {pending ? "Отменяю…" : "Отменить"}
      </button>
      {error && <span role="alert" style={{ color: "#b3402f", fontSize: 12 }}>{error}</span>}
    </>
  );
}
