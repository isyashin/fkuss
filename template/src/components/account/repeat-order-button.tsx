"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { repeatOrder } from "@/app/account/actions";
import { useCart } from "@/lib/cart/store";
import styles from "./account.module.css";

/** Повторить заказ: сервер отдаёт актуальные цены/доступность; недоступные позиции пропускаются с уведомлением. */
export function RepeatOrderButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState("");
  const add = useCart((s) => s.add);
  const clear = useCart((s) => s.clear);

  return (
    <>
      <button type="button" className={styles.btn + " " + styles.btnOutline} disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setNotice("");
            const result = await repeatOrder(orderId);
            if (!result.ok) { setNotice(result.error ?? "Не удалось повторить"); return; }
            clear();
            for (const item of result.items) {
              add({ dishId: item.dishId, name: item.name, price: item.price, image: "", modifiers: item.modifiers }, item.quantity);
            }
            if (result.items.length === 0) {
              setNotice("Блюда из этого заказа сейчас недоступны");
              return;
            }
            if (result.skipped.length > 0) setNotice(`Недоступны и пропущены: ${result.skipped.join(", ")}`);
            router.push("/#menu");
          })
        }>
        {pending ? "Собираю…" : "Повторить"}
      </button>
      {notice && <span className={styles.note} role="status">{notice}</span>}
    </>
  );
}
