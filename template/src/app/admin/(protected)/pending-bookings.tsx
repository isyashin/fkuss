"use client";

import Link from "next/link";
import type { Reservation } from "@/generated/prisma/client";
import type { GuestChannels } from "@/lib/guest-contact";
import { AdminIcon } from "./admin-icon";
import styles from "./admin-ui.module.css";

const guestWord = (count: number) => {
  const form = new Intl.PluralRules("ru-RU").select(count);
  return form === "one" ? "гость" : form === "few" ? "гостя" : "гостей";
};

export function PendingBookings({ bookings }: { bookings: Reservation[]; guestContact: GuestChannels }) {
  return <aside className={`${styles.panel} ${styles.pendingBookings}`} aria-label="Ближайшие брони">
    <div className={styles.panelTitle}><h2>Брони</h2><Link className={styles.bookingLink} href="/admin/bookings">Все брони</Link></div>
    {bookings.length ? <div className={styles.pendingBookingList}>{bookings.map((booking) => <div className={styles.pendingBooking} key={booking.id}>
      <Link className={styles.bookingOpen} href={`/admin/bookings?selected=${encodeURIComponent(booking.id)}`} aria-label={`Открыть бронь ${booking.date} ${booking.time}, ${booking.customerName}`}/>
      <div className={styles.pendingBookingInfo}><strong>{booking.date} · {booking.time}</strong><small>{booking.guests} {guestWord(booking.guests)} · {booking.customerName}</small></div>
      <span className={`${styles.badge} ${booking.status === "new" ? styles.new : styles.done}`}>{booking.status === "new" ? "Новая" : "Подтверждена"}</span><AdminIcon name="chevron" size={17}/>
    </div>)}</div> : <p className={styles.empty}>Предстоящих броней нет.</p>}
  </aside>;
}
