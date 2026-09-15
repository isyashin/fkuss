"use client";

import { useEffect, useState } from "react";
import { useCart } from "@/lib/cart/store";

/** Sticky нижняя панель корзины — всегда под пальцем на мобильном */
export function CartBar({ onOpen }: { onOpen: () => void }) {
  const [mounted, setMounted] = useState(false);
  const count = useCart((s) => s.count());
  const total = useCart((s) => s.total());

  useEffect(() => setMounted(true), []);
  if (!mounted || count === 0) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 p-3 safe-area-inset-bottom">
      <button
        onClick={onOpen}
        className="w-full max-w-5xl mx-auto min-h-14 rounded-full bg-accent text-white font-medium text-lg shadow-lg flex items-center justify-between px-6"
      >
        <span>Корзина · {count}</span>
        <span>{total.toLocaleString("ru-RU")} ₽</span>
      </button>
    </div>
  );
}
