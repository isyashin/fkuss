"use client";

import Link from "next/link";
import { useState } from "react";
import type { Reservation } from "@/generated/prisma/client";
import { adminListHref, bookingListCounts, BOOKING_STATUSES, type BookingListQuery } from "@/lib/admin-list-query";
import { AdminPagination } from "../admin-pagination";
import { BookingCard } from "./booking-card";
import styles from "../admin-ui.module.css";
import type { GuestChannels } from "@/lib/guest-contact";

const statusNames: Record<string, string> = { new: "Новая", confirmed: "Подтверждена", rejected: "Отклонена", cancelled: "Отменена" };

export function BookingsDashboard({ bookings, counts, query, page, pageCount, guestContact, timeZone }: { bookings: Reservation[]; counts: ReturnType<typeof bookingListCounts>; query: BookingListQuery; page: number; pageCount: number; guestContact: GuestChannels; timeZone: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = bookings.find((booking) => booking.id === selectedId) ?? bookings[0];
  const href = (next: BookingListQuery) => adminListHref("/admin/bookings", next);

  return <div className={styles.dashboard}>
    <section className={styles.panel} aria-label="Список броней">
      <div className={styles.panelTitle}><div><span className={styles.eyebrow}>Зал ресторана</span><h1>Брони</h1></div><Link className={styles.sortButton} prefetch={false} href={href({ ...query, sort: query.sort === "desc" ? "asc" : "desc", page: 1 })}>{query.sort === "desc" ? "Сначала поздние ↓" : "Сначала ранние ↑"}</Link></div>
      <div className={styles.filters} role="group" aria-label="Фильтр броней">{BOOKING_STATUSES.map((status) => <Link key={status} prefetch={false} href={href({ ...query, status, page: 1 })} aria-current={query.status === status ? "page" : undefined}>{status === "all" ? "Все" : statusNames[status]} <span className={styles.count}>{counts[status]}</span></Link>)}</div>
      <div className={styles.list}>{bookings.length ? bookings.map((booking) => <button key={booking.id} type="button" className={styles.row} aria-label={`Открыть бронь ${booking.date} ${booking.time}, ${booking.customerName}`} aria-pressed={selected?.id === booking.id} onClick={() => setSelectedId(booking.id)}>
        <span><strong>{booking.time}</strong><small>{booking.date}</small></span>
        <span className={styles.rowMain}><strong>{booking.customerName}</strong><small>{booking.guests} гостей · {booking.customerPhone}</small></span>
        <span className={`${styles.badge} ${booking.status === "new" ? styles.new : booking.status === "cancelled" ? styles.cancelled : booking.status === "confirmed" ? styles.done : ""}`}>{statusNames[booking.status] ?? booking.status}</span>
      </button>) : <p className={styles.empty}>Броней с таким статусом пока нет.</p>}</div>
      <AdminPagination base="/admin/bookings" query={query} page={page} pageCount={pageCount} total={counts[query.status]}/>
    </section>
    <section className={styles.panel} aria-label="Детали брони">{selected ? <BookingCard key={selected.id} booking={selected} guestContact={guestContact} timeZone={timeZone}/> : <p className={styles.empty}>Выберите бронь из списка.</p>}</section>
  </div>;
}
