"use client";

import { useRouter } from "next/navigation";
import { useCart, type CartModifier } from "@/lib/cart/store";

interface ReorderItem {
  dishId: string;
  name: string;
  price: number;
  quantity: number;
  modifiers: CartModifier[];
}

/** Повторить заказ: позиции снимка заказа — в корзину, переход к меню */
export function RepeatOrderButton({ items }: { items: ReorderItem[] }) {
  const router = useRouter();
  const add = useCart((s) => s.add);
  const clear = useCart((s) => s.clear);

  return (
    <button
      onClick={() => {
        clear();
        for (const item of items) {
          add(
            {
              dishId: item.dishId,
              name: item.name,
              price: item.price,
              image: "",
              modifiers: item.modifiers,
            },
            item.quantity,
          );
        }
        router.push("/#menu");
      }}
      className="min-h-11 px-4 rounded-full bg-accent text-white text-sm font-medium"
    >
      Повторить
    </button>
  );
}
