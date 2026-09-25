"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Reservation } from "@/generated/prisma/client";
import { setBookingStatus } from "../actions";
import styles from "../admin-ui.module.css";
import { GuestContactActions } from "../guest-contact-actions";
import type { GuestChannels } from "@/lib/guest-contact";

const statusNames: Record<string, string> = { new: "Новая", confirmed: "Подтверждена", rejected: "Отклонена", cancelled: "Отменена" };

export function BookingCard({ booking, guestContact }: { booking: Reservation; guestContact: GuestChannels }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const run = (status: string) => startTransition(async () => {
    setError("");
    try { await setBookingStatus(booking.id, status); router.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось изменить бронь"); }
  });

  return <>
    <div className={styles.detailHeader}><div><span className={styles.eyebrow}>Детали брони</span><h2>{booking.date} · {booking.time}</h2><p className={styles.muted}>Создана {booking.createdAt.toLocaleString("ru-RU")}</p></div><span className={`${styles.badge} ${booking.status === "new" ? styles.new : booking.status === "confirmed" ? styles.done : booking.status === "cancelled" ? styles.cancelled : ""}`}>{statusNames[booking.status] ?? booking.status}</span></div>
    <div className={styles.facts}>
      <div className={styles.fact}><span>Гость</span><strong>{booking.customerName}</strong></div>
      <div className={styles.fact}><span>Связь</span><GuestContactActions phone={booking.customerPhone} preferredChannel={null} channels={guestContact}/></div>
      <div className={styles.fact}><span>Гостей</span><strong>{booking.guests}</strong></div>
      <div className={styles.fact}><span>Статус</span><strong>{statusNames[booking.status] ?? booking.status}</strong></div>
      {booking.comment && <div className={styles.fact}><span>Пожелание</span><strong>{booking.comment}</strong></div>}
    </div>
    {booking.status === "new" && <div className={styles.actions}><button type="button" disabled={pending} onClick={() => run("confirmed")}>Подтвердить</button><button type="button" disabled={pending} onClick={() => run("rejected")}>Отклонить</button></div>}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </>;
}
