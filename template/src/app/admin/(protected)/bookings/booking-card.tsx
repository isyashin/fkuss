"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Reservation } from "@/generated/prisma/client";
import { setBookingStatus } from "../actions";
import styles from "../admin-ui.module.css";
import { GuestContactActions } from "../guest-contact-actions";
import type { GuestChannels } from "@/lib/guest-contact";
import { formatAdminDate } from "@/lib/admin-date";

const statusNames: Record<string, string> = { new: "Новая", confirmed: "Подтверждена", rejected: "Отклонена", cancelled: "Отменена" };

export function BookingCard({ booking, guestContact, timeZone, when }: { booking: Reservation; guestContact: GuestChannels; timeZone: string; when: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const run = (status: string) => startTransition(async () => {
    setError("");
    try { await setBookingStatus(booking.id, status); router.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось изменить бронь"); }
  });

  return <>
    <div className={styles.detailHeader}><div><span className={styles.eyebrow}>Детали брони</span><h2>{when}</h2><p className={styles.muted}>Создана {formatAdminDate(booking.createdAt, timeZone)}</p></div><span className={`${styles.badge} ${styles.bookingStatus} ${booking.status === "new" ? styles.new : booking.status === "cancelled" || booking.status === "rejected" ? styles.cancelled : ""}`}>{statusNames[booking.status] ?? booking.status}</span></div>
    <div className={`${styles.facts} ${styles.bookingFacts}`}>
      <div className={styles.fact}><span>Имя</span><strong>{booking.customerName}</strong></div>
      <div className={styles.fact}><span>Связь</span><GuestContactActions phone={booking.customerPhone} preferredChannel={null} channels={guestContact} showTelegramHint={false}/></div>
      <div className={styles.fact}><span>Гостей</span><strong>{booking.guests}</strong></div>
      <div className={styles.fact}><span>Пожелание</span><strong>{booking.comment || "Нет"}</strong></div>
      <div className={styles.fact}><span>Статус</span><strong>{statusNames[booking.status] ?? booking.status}</strong></div>
    </div>
    {booking.status === "new" && <div className={`${styles.actions} ${styles.bookingActions}`}><button type="button" disabled={pending} onClick={() => run("confirmed")}>Подтвердить бронь</button><button type="button" disabled={pending} onClick={() => run("rejected")}>Отклонить</button></div>}
    {booking.status === "confirmed" && <div className={`${styles.actions} ${styles.bookingActions}`}><button type="button" disabled>Бронь подтверждена</button></div>}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </>;
}
