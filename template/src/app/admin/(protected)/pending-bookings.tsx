"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Reservation } from "@/generated/prisma/client";
import type { GuestChannels } from "@/lib/guest-contact";
import { AdminIcon } from "./admin-icon";
import { setBookingStatus } from "./actions";
import styles from "./admin-ui.module.css";

const guestWord = (count: number) => {
  const form = new Intl.PluralRules("ru-RU").select(count);
  return form === "one" ? "гость" : form === "few" ? "гостя" : "гостей";
};

export function PendingBookings({ bookings }: { bookings: Reservation[]; guestContact: GuestChannels }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const decide = (id: string, status: "confirmed" | "rejected") => {
    setError("");
    startTransition(async () => {
      try { await setBookingStatus(id, status); router.refresh(); }
      catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось изменить бронь"); }
    });
  };
  return <section className={`${styles.panel} ${styles.pendingBookings}`} aria-label="Ближайшие брони">
    <div className={styles.panelTitle}><h2>Брони</h2><Link className={styles.bookingLink} href="/admin/bookings">Все брони</Link></div>
    {bookings.length ? <div className={styles.pendingBookingList}>{bookings.map((booking) => <div className={styles.pendingBooking} key={booking.id}>
      <Link className={styles.bookingOpen} href={`/admin/bookings?selected=${encodeURIComponent(booking.id)}`} aria-label={`Открыть бронь ${booking.date} ${booking.time}, ${booking.customerName}`}>
        <span className={styles.pendingBookingInfo}><strong>{booking.date} · {booking.time}</strong><small>{booking.guests} {guestWord(booking.guests)} · {booking.customerName}</small></span>
        <span className={`${styles.badge} ${booking.status === "new" ? styles.new : styles.done}`}>{booking.status === "new" ? "Новая" : "Подтверждена"}</span><AdminIcon name="chevron" size={17}/>
      </Link>
      {booking.status === "new" && <div className={styles.pendingBookingActions}><button type="button" disabled={pending} onClick={() => decide(booking.id, "confirmed")}>Подтвердить</button><button type="button" disabled={pending} onClick={() => decide(booking.id, "rejected")}>Отклонить</button></div>}
    </div>)}</div> : <p className={styles.empty}>Предстоящих броней нет.</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </section>;
}
