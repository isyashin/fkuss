"use client";

import { useTransition } from "react";
import { setBookingStatus } from "../actions";
import type { Reservation } from "@/generated/prisma/client";

const STATUS_NAMES: Record<string, string> = {
  new: "Новая",
  confirmed: "Подтверждена",
  rejected: "Отклонена",
  cancelled: "Отменена",
};

export function BookingCard({ booking }: { booking: Reservation }) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="bg-card rounded-[var(--radius)] p-4">
      <div className="flex flex-wrap justify-between gap-2 items-baseline">
        <p className="font-medium">
          {booking.date} в {booking.time} · {booking.guests} гостей
        </p>
        <p className="text-sm">{STATUS_NAMES[booking.status] ?? booking.status}</p>
      </div>
      <p className="text-muted text-sm mt-1">
        {booking.customerName} · {booking.customerPhone}
      </p>
      {booking.comment && <p className="text-muted text-sm mt-0.5">💬 {booking.comment}</p>}

      {booking.status === "new" && (
        <div className="flex gap-2 mt-3">
          <button
            disabled={pending}
            onClick={() => startTransition(() => setBookingStatus(booking.id, "confirmed"))}
            className="min-h-11 px-4 rounded-full bg-accent text-white text-sm font-medium disabled:opacity-50"
          >
            Подтвердить
          </button>
          <button
            disabled={pending}
            onClick={() => startTransition(() => setBookingStatus(booking.id, "rejected"))}
            className="min-h-11 px-4 rounded-full border border-foreground/20 text-sm disabled:opacity-50"
          >
            Отклонить
          </button>
        </div>
      )}
    </div>
  );
}
