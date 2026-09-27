"use client";

import { useTransition } from "react";
import { cancelBooking } from "@/app/account/actions";
import styles from "./account.module.css";

export function CancelBookingButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => {
        if (confirm("Отменить бронь?")) startTransition(() => cancelBooking(id));
      }}
      className={styles.btn + " " + styles.btnDanger}
    >
      {pending ? "Отменяю…" : "Отменить"}
    </button>
  );
}
