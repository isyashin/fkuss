"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Reservation } from "@/generated/prisma/client";
import { setBookingStatus } from "./actions";
import { GuestContactActions } from "./guest-contact-actions";
import type { GuestChannels } from "@/lib/guest-contact";
import styles from "./admin-ui.module.css";

const guestWord = (count: number) => {
  const form = new Intl.PluralRules("ru-RU").select(count);
  return form === "one" ? "гость" : form === "few" ? "гостя" : "гостей";
};

export function PendingBookings({ bookings, guestContact }: { bookings: Reservation[]; guestContact: GuestChannels }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const decide = (id: string, status: "confirmed" | "rejected") => {
    setError("");
    startTransition(async () => {
      try { await setBookingStatus(id, status); router.refresh(); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось изменить бронь"); }
    });
  };

  return <section className={`${styles.panel} ${styles.pendingBookings}`} aria-label="Ближайшие брони">
    <div className={styles.panelTitle}><div><span className={styles.eyebrow}>Зал ресторана</span><h2>Ближайшие брони</h2></div><Link className={styles.sortButton} href="/admin/bookings">Все брони</Link></div>
    {bookings.length ? <div className={styles.pendingBookingList}>{bookings.map((booking) => <div className={styles.pendingBooking} key={booking.id}>
      <div className={styles.pendingBookingInfo}><strong>{booking.date} · {booking.time}</strong><span>{booking.customerName} · {booking.guests} {guestWord(booking.guests)}</span><span className={`${styles.badge} ${booking.status === "confirmed" ? styles.done : styles.new}`}>{booking.status === "confirmed" ? "Подтверждена" : "Новая"}</span><GuestContactActions phone={booking.customerPhone} preferredChannel={null} channels={guestContact} compact/></div>
      {booking.status === "new" && <div className={styles.pendingBookingActions}><button type="button" disabled={pending} onClick={() => decide(booking.id, "confirmed")}>Подтвердить</button><button type="button" disabled={pending} onClick={() => decide(booking.id, "rejected")}>Отклонить</button></div>}
    </div>)}</div> : <p className={styles.empty}>Предстоящих броней нет.</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </section>;
}
