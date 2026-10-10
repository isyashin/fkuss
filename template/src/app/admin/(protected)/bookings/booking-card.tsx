"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Reservation } from "@/generated/prisma/client";
import { setBookingStatus } from "../actions";
import { StatusPill } from "../status-pill";
import { ConfirmDialog } from "../confirm-dialog";
import styles from "../admin-ui.module.css";
import { GuestContactActions } from "../guest-contact-actions";
import type { GuestChannels } from "@/lib/guest-contact";
import { formatAdminDate } from "@/lib/admin-date";

const statusNames: Record<string, string> = { new: "Новая", confirmed: "Подтверждена", rejected: "Отклонена", cancelled: "Отменена" };

function statusTone(status: string): "new" | "success" | "danger" {
  if (status === "new") return "new";
  if (status === "confirmed") return "success";
  return "danger";
}

export function BookingCard({ booking, guestContact, timeZone, when, onBack }: { booking: Reservation; guestContact: GuestChannels; timeZone: string; when: string; onBack: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<null | "rejected" | "cancelled">(null);
  const run = (status: string) => startTransition(async () => {
    setError("");
    try { await setBookingStatus(booking.id, status); router.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось изменить бронь"); }
  });
  const upcoming = ["new", "confirmed"].includes(booking.status);

  return <div className={styles.detailInner}>
    <button type="button" className={styles.backButton} onClick={onBack}>← К броням</button>
    <div className={styles.detailHeader}>
      <div className={styles.detailTitle}><h2>{when}</h2><StatusPill tone={statusTone(booking.status)}>{statusNames[booking.status] ?? booking.status}</StatusPill></div>
      <p className={styles.muted}>Создана {formatAdminDate(booking.createdAt, timeZone)}</p>
      <div className={styles.detailActions}>
        {booking.status === "new" && <>
          <button type="button" className={styles.primaryAction} disabled={pending} onClick={() => run("confirmed")}>Подтвердить</button>
          <button type="button" className={styles.cancelAction} disabled={pending} onClick={() => setConfirm("rejected")}>Отклонить</button>
        </>}
        {booking.status === "confirmed" && upcoming && <button type="button" className={styles.cancelAction} disabled={pending} onClick={() => setConfirm("cancelled")}>Отменить бронь</button>}
      </div>
    </div>
    <section className={styles.detailSection}>
      <h3 className={styles.contactName}>{booking.customerName}</h3>
      <GuestContactActions phone={booking.customerPhone} preferredChannel={null} channels={guestContact} showTelegramHint={false}/>
    </section>
    <section className={styles.detailSection}>
      <div className={styles.facts}>
        <div className={styles.fact}><span>Гостей</span><strong>{booking.guests}</strong></div>
        <div className={styles.fact}><span>Телефон</span><strong>{booking.customerPhone}</strong></div>
      </div>
      {booking.comment && <p className={styles.note}>{booking.comment}</p>}
    </section>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <ConfirmDialog
      request={confirm === "rejected" ? {
        title: "Отклонить бронь?",
        text: `Бронь ${booking.customerName} на ${when} перейдёт в историю.`,
        acceptLabel: "Отклонить",
        onAccept: () => run("rejected"),
      } : confirm === "cancelled" ? {
        title: "Отменить бронь?",
        text: `Подтверждённая бронь ${booking.customerName} на ${when} будет отменена.`,
        acceptLabel: "Отменить бронь",
        onAccept: () => run("cancelled"),
      } : null}
      onClose={() => setConfirm(null)}
    />
  </div>;
}
