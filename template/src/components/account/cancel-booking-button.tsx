"use client";

import { useTransition } from "react";
import { cancelBooking } from "@/app/account/actions";

export function CancelBookingButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => {
        if (confirm("Отменить бронь?")) startTransition(() => cancelBooking(id));
      }}
      className="min-h-11 px-4 rounded-full border border-red-300 text-red-600 text-sm"
    >
      Отменить
    </button>
  );
}
