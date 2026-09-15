"use client";

import { useTransition } from "react";
import { setOrderStatus } from "./actions";
import type { Order, OrderItem } from "@/generated/prisma/client";

const STATUS_NAMES: Record<string, string> = {
  new: "Новый",
  accepted: "Принят",
  cooking: "Готовится",
  delivering: "В пути",
  done: "Выполнен",
  cancelled: "Отменён",
};

const NEXT_ACTIONS: Record<string, { status: string; label: string }[]> = {
  new: [
    { status: "accepted", label: "Принять" },
    { status: "cancelled", label: "Отменить" },
  ],
  accepted: [
    { status: "cooking", label: "Готовится" },
    { status: "cancelled", label: "Отменить" },
  ],
  cooking: [
    { status: "delivering", label: "В пути" },
    { status: "done", label: "Выполнен" },
    { status: "cancelled", label: "Отменить" },
  ],
  delivering: [
    { status: "done", label: "Выполнен" },
    { status: "cancelled", label: "Отменить" },
  ],
};

export function OrderCard({ order }: { order: Order & { items: OrderItem[] } }) {
  const [pending, startTransition] = useTransition();
  const actions = NEXT_ACTIONS[order.status] ?? [];

  return (
    <div className="bg-card rounded-[var(--radius)] p-4">
      <div className="flex flex-wrap justify-between gap-2 items-baseline">
        <p className="font-medium">
          №{order.number} · {STATUS_NAMES[order.status] ?? order.status}
          {order.paymentStatus === "paid" && <span className="ml-2 text-green-600 text-sm">оплачен</span>}
        </p>
        <p className="font-semibold text-accent">{order.total.toLocaleString("ru-RU")} ₽</p>
      </div>
      <p className="text-sm mt-1">
        {order.items.map((i) => `${i.name} ×${i.quantity}`).join(", ")}
      </p>
      <p className="text-muted text-sm mt-1">
        {order.customerName} · {order.customerPhone} ·{" "}
        {order.type === "delivery" ? `доставка: ${order.addressText}` : "самовывоз"}
      </p>
      {order.comment && <p className="text-muted text-sm mt-0.5">💬 {order.comment}</p>}
      <p className="text-muted text-xs mt-1">{order.createdAt.toLocaleString("ru-RU")}</p>

      {actions.length > 0 && (
        <div className="flex gap-2 mt-3">
          {actions.map((action) => (
            <button
              key={action.status}
              disabled={pending}
              onClick={() => startTransition(() => setOrderStatus(order.id, action.status))}
              className={`min-h-11 px-4 rounded-full text-sm font-medium disabled:opacity-50 ${
                action.status === "cancelled"
                  ? "border border-foreground/20"
                  : "bg-accent text-white"
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
