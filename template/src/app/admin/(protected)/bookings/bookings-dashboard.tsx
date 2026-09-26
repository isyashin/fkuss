"use client";

import Link from "next/link";
import { useState } from "react";
import type { Reservation } from "@/generated/prisma/client";
import { adminListHref, bookingListCounts, BOOKING_STATUSES, type BookingListQuery } from "@/lib/admin-list-query";
import type { GuestChannels } from "@/lib/guest-contact";
import { AdminIcon } from "../admin-icon";
import { AdminPagination } from "../admin-pagination";
import { BookingCard } from "./booking-card";
import styles from "../admin-ui.module.css";

const statusNames: Record<string, string> = { new: "Новая", confirmed: "Подтверждена", rejected: "Отклонена", cancelled: "Отменена" };

function bookingWhen(booking: Reservation, today: string) {
  const nextDay = new Date(`${today}T12:00:00Z`);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const day = booking.date === today ? "Сегодня" : booking.date === nextDay.toISOString().slice(0, 10) ? "Завтра" : booking.date;
  return `${day}, ${booking.time}`;
}

export function BookingsDashboard({ bookings, upcomingBookings, counts, query, page, pageCount, guestContact, timeZone, today, initialSelectedId, selectedBooking }: {
  bookings: Reservation[]; upcomingBookings: Reservation[]; counts: ReturnType<typeof bookingListCounts>; query: BookingListQuery; page: number; pageCount: number;
  guestContact: GuestChannels; timeZone: string; today: string; initialSelectedId?: string | null; selectedBooking?: Reservation | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null);
  const selected = selectedId
    ? upcomingBookings.find((booking) => booking.id === selectedId) ?? bookings.find((booking) => booking.id === selectedId) ?? (selectedBooking?.id === selectedId ? selectedBooking : null)
    : upcomingBookings[0] ?? null;
  const href = (next: BookingListQuery) => adminListHref("/admin/bookings", next);
  const showArchive = query.status !== "all" || query.sort !== "desc" || query.page > 1;
  const bookingItem = (booking: Reservation) => <button key={booking.id} type="button"
    className={`${styles.bookingItem} ${booking.status === "new" ? styles.bookingItemFresh : ""} ${selected?.id === booking.id ? styles.bookingItemSelected : ""}`}
    aria-label={`Открыть бронь ${booking.date} ${booking.time}, ${booking.customerName}`} aria-pressed={selected?.id === booking.id}
    onClick={() => setSelectedId(booking.id)}>
    <span className={styles.bookingItemCopy}><strong>{bookingWhen(booking, today)}</strong><small>{booking.customerName} · {booking.guests} {booking.guests === 1 ? "гость" : booking.guests >= 2 && booking.guests <= 4 ? "гостя" : "гостей"}</small></span>
    <span className={`${styles.badge} ${styles.bookingStatus} ${booking.status === "new" ? styles.new : booking.status === "cancelled" || booking.status === "rejected" ? styles.cancelled : ""}`}>{statusNames[booking.status] ?? booking.status}</span>
    <AdminIcon name="chevron" size={18}/>
  </button>;

  return <div className={styles.bookingPage}>
    <div className={styles.bookingIntro}><span className={styles.eyebrow}>Зал ресторана</span><h1>Брони</h1><p>Предстоящие бронирования и пожелания гостей.</p></div>
    <div className={styles.bookingsLayout}>
      <section className={`${styles.panel} ${styles.bookingMain}`} aria-label="Список броней">
        <div className={styles.bookingSectionHeading}><h2>Предстоящие</h2><span className={styles.bookingCount}>{upcomingBookings.length}</span></div>
        <div className={styles.bookingItems}>{upcomingBookings.length ? upcomingBookings.map(bookingItem) : <p className={styles.empty}>Предстоящих броней нет.</p>}</div>
        <details key={`${query.status}-${query.sort}-${query.page}`} className={styles.bookingArchive} open={showArchive}>
          <summary>Все брони и фильтры</summary>
          <div className={styles.bookingArchiveContent}>
            <div className={styles.bookingArchiveHeading}><h3>Все брони</h3><Link className={styles.sortButton} prefetch={false} href={href({ ...query, sort: query.sort === "desc" ? "asc" : "desc", page: 1 })}>{query.sort === "desc" ? "Сначала поздние ↓" : "Сначала ранние ↑"}</Link></div>
            <div className={styles.filters} role="group" aria-label="Фильтр броней">{BOOKING_STATUSES.map((status) => <Link key={status} prefetch={false} href={href({ ...query, status, page: 1 })} aria-current={query.status === status ? "page" : undefined}>{status === "all" ? "Все" : statusNames[status]} <span className={styles.count}>{counts[status]}</span></Link>)}</div>
            <div className={styles.bookingItems}>{bookings.length ? bookings.map(bookingItem) : <p className={styles.empty}>Броней с таким статусом пока нет.</p>}</div>
            <AdminPagination base="/admin/bookings" query={query} page={page} pageCount={pageCount} total={counts[query.status]}/>
          </div>
        </details>
      </section>
      <section className={`${styles.panel} ${styles.bookingDetail}`} aria-label="Детали брони">{selected ? <BookingCard key={selected.id} booking={selected} guestContact={guestContact} timeZone={timeZone} when={bookingWhen(selected, today)}/> : <p className={styles.empty}>Выберите бронь из списка.</p>}</section>
    </div>
  </div>;
}
