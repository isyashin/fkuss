"use client";

import Link from "next/link";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Reservation } from "@/generated/prisma/client";
import { adminListHref, BOOKING_MODES, type BookingListQuery } from "@/lib/admin-list-query";
import { AdminPagination } from "../admin-pagination";
import { StatusPill } from "../status-pill";
import { BookingCard } from "./booking-card";
import styles from "../admin-ui.module.css";

const statusNames: Record<string, string> = { new: "Новая", confirmed: "Подтверждена", rejected: "Отклонена", cancelled: "Отменена" };
const modeNames: Record<string, string> = { upcoming: "Предстоящие", new: "Ожидают", history: "История" };
const guestWord = (count: number) => { const form = new Intl.PluralRules("ru-RU").select(count); return form === "one" ? "гость" : form === "few" ? "гостя" : "гостей" };

function statusTone(status: string): "new" | "success" | "danger" {
  if (status === "new") return "new";
  if (status === "confirmed") return "success";
  return "danger";
}

export function BookingsDashboard({ bookings, counts, query, page, pageCount, guestContact, timeZone, today, initialSelectedId, selectedBooking }: {
  bookings: Reservation[]; counts: { upcoming: number; pending: number; history: number }; query: BookingListQuery; page: number; pageCount: number;
  guestContact: Parameters<typeof BookingCard>[0]["guestContact"]; timeZone: string; today: string; initialSelectedId?: string | null; selectedBooking?: Reservation | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null);
  // Прямая ссылка ?selected= на телефоне сразу открывает деталь вместо списка.
  const [mobileDetail, setMobileDetail] = useState(() => Boolean(initialSelectedId));
  const router = useRouter();
  // D05: позиция списка сохраняется при открытии брони и восстанавливается по возврату.
  const paneRef = useRef<HTMLElement | null>(null);
  const savedScrollRef = useRef({ win: 0, pane: 0 });
  const restoreListScroll = () => setTimeout(() => {
    window.scrollTo(0, savedScrollRef.current.win);
    if (paneRef.current) paneRef.current.scrollTop = savedScrollRef.current.pane;
  }, 400);
  const selected = (selectedId ? bookings.find((booking) => booking.id === selectedId) ?? (selectedBooking?.id === selectedId ? selectedBooking : null) : null) ?? bookings[0] ?? null;
  const href = (next: BookingListQuery) => adminListHref("/admin/bookings", next);
  // Выбор держим в URL (?selected=), чтобы он переживал router.refresh().
  const select = (id: string) => {
    savedScrollRef.current = { win: window.scrollY, pane: paneRef.current?.scrollTop ?? 0 };
    setSelectedId(id);
    setMobileDetail(true);
    window.scrollTo(0, 0);
    const base = href(query);
    router.replace(`${base}${base.includes("?") ? "&" : "?"}selected=${encodeURIComponent(id)}`, { scroll: false });
  };
  const bookingWhen = (booking: Reservation) => {
    const nextDay = new Date(`${today}T12:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const day = booking.date === today ? "Сегодня" : booking.date === nextDay.toISOString().slice(0, 10) ? "Завтра" : new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date(`${booking.date}T12:00:00`));
    return `${day}, ${booking.time}`;
  };
  // Разделители дней — в хронологических режимах.
  const dayDivider = (booking: Reservation) => {
    if (query.mode === "history") return null;
    const nextDay = new Date(`${today}T12:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    if (booking.date === today) return "Сегодня";
    if (booking.date === nextDay.toISOString().slice(0, 10)) return "Завтра";
    return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", weekday: "long" }).format(new Date(`${booking.date}T12:00:00`));
  };

  return <div className={`${styles.dashboard} ${styles.bookingsDashboard} ${mobileDetail ? styles.mobileDetail : ""}`}>
    <section className={styles.ordersPanel} aria-label="Список броней" ref={paneRef as never}>
      <div className={styles.queueHead}><h1>Брони</h1></div>
      <div
        className={styles.filters}
        role="tablist"
        aria-label="Режим списка броней"
        onKeyDown={(event) => {
          const tabs = [...event.currentTarget.querySelectorAll<HTMLAnchorElement>('[role="tab"]')];
          const current = tabs.indexOf(document.activeElement as HTMLAnchorElement);
          if (current < 0) return;
          const next = event.key === "ArrowRight" ? (current + 1) % tabs.length
            : event.key === "ArrowLeft" ? (current - 1 + tabs.length) % tabs.length
            : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
          if (next < 0) return;
          event.preventDefault();
          tabs[next].focus();
          tabs[next].click();
        }}
      >
        {BOOKING_MODES.map((mode) => <Link key={mode} prefetch={false} role="tab" tabIndex={query.mode === mode ? 0 : -1} aria-selected={query.mode === mode} href={href({ ...query, mode, page: 1 })} aria-current={query.mode === mode ? "page" : undefined}>{modeNames[mode]} <span className={styles.count}>{counts[mode === "new" ? "pending" : mode]}</span></Link>)}
      </div>
      <form className={`${styles.queueTools} ${styles.queueToolsSingle}`} role="search" action="/admin/bookings" method="get" key={`${query.mode}|${query.sort}|${query.q}`}>
        {query.mode !== "upcoming" && <input type="hidden" name="mode" value={query.mode} />}
        {query.sort !== "desc" && <input type="hidden" name="sort" value={query.sort} />}
        <input className={styles.searchInput} type="search" name="q" defaultValue={query.q} placeholder="Имя или телефон" maxLength={60} aria-label="Поиск брони" />
        <button type="submit" className={styles.searchButton}>Найти</button>
        {query.q && <Link className={styles.searchReset} href={href({ ...query, q: "", page: 1 })}>Сбросить поиск</Link>}
      </form>
      <div className={styles.list}>{bookings.length ? bookings.map((booking, index) => {
        const divider = dayDivider(booking);
        const prevDivider = index > 0 ? dayDivider(bookings[index - 1]) : null;
        return <div key={booking.id}>
          {divider && divider !== prevDivider && <p className={styles.dayDivider}>{divider}</p>}
          <div className={`${styles.orderPreview} ${styles.bookingRow} ${selected?.id === booking.id ? styles.selectedPreview : ""}`}>
            <button type="button" className={styles.orderOpen} aria-label={`Открыть бронь ${booking.date} ${booking.time}, ${booking.customerName}`} aria-pressed={selected?.id === booking.id} onClick={() => select(booking.id)}/>
            <span className={styles.rowTop}><span><strong>{bookingWhen(booking)}</strong></span><StatusPill tone={statusTone(booking.status)}>{statusNames[booking.status] ?? booking.status}</StatusPill></span>
            <span className={styles.rowPerson}>{booking.customerName}</span>
            <span className={styles.rowBottom}><span>{booking.guests} {guestWord(booking.guests)}{booking.comment ? ` · ${booking.comment}` : ""}</span><b></b></span>
          </div>
        </div>;
      }) : <p className={styles.empty}>Броней по этим условиям нет.</p>}</div>
      <AdminPagination base="/admin/bookings" query={query} page={page} pageCount={pageCount} total={query.mode === "history" ? counts.history : query.mode === "new" ? counts.pending : counts.upcoming}/>
    </section>
    <section className={styles.detailPanel} aria-label="Детали брони">
      {selected ? <BookingCard key={selected.id} booking={selected} guestContact={guestContact} timeZone={timeZone} when={bookingWhen(selected)} onBack={() => { setMobileDetail(false); restoreListScroll(); }}/>
        : <div className={styles.detailInner}><p className={styles.empty}>Выберите бронь.</p></div>}
    </section>
  </div>;
}
