"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { playAdminSound } from "@/lib/admin-audio";
import styles from "./admin-redesign.module.css";
import { AdminIcon } from "./admin-icon";
import {
  getNotificationsSnapshot,
  getEmptyNotificationsSnapshot,
  subscribeNotifications,
  pollNotificationsNow,
  readSoundEnabled,
  writeSoundEnabled,
  subscribeSoundEnabled,
  resetNotificationsUnread,
  setNotificationsError,
} from "./admin-notifications-store";

const DEFAULT_HINT = "Включите звук нажатием кнопки — браузер требует вашего действия.";

/**
 * Колокольчик новых событий. Оболочка рендерит ДВА экземпляра (rail + topbar) —
 * все данные (события, счётчики, звук, бейдж) живут в общем сторе на вкладку
 * (admin-notifications-store), экземпляры лишь отображают одно и то же.
 */
export function AdminNotifications({ actorId }: { actorId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // Панель не должна «прилипать» при переходах между разделами.
  // Корректировка состояния во время рендера (react-compiler: не setState в эффекте).
  const [panelPath, setPanelPath] = useState(pathname);
  if (panelPath !== pathname) { setPanelPath(pathname); setOpen(false); }
  const subscribe = useCallback((listener: () => void) => subscribeNotifications(actorId, listener), [actorId]);
  const getSnapshot = useCallback(() => getNotificationsSnapshot(actorId), [actorId]);
  const state = useSyncExternalStore(subscribe, getSnapshot, getEmptyNotificationsSnapshot);
  // sessionStorage — источник истины: серверный снапшот false совпадает с SSR,
  // после гидрации читается реальное значение (без рассинхрона #418).
  const enabled = useSyncExternalStore(subscribeSoundEnabled, readSoundEnabled, () => false);
  const hint = state.error ?? (enabled ? "Звук включён для этой вкладки." : DEFAULT_HINT);
  const lastRefreshTick = useRef(state.refreshTick);

  useEffect(() => {
    if (state.refreshTick !== lastRefreshTick.current) {
      lastRefreshTick.current = state.refreshTick;
      router.refresh();
    }
  }, [state.refreshTick, router]);

  async function enableSound() {
    try {
      await playAdminSound(state.sound);
      setNotificationsError(null);
      writeSoundEnabled(true);
    } catch {
      setNotificationsError("Браузер не воспроизвёл звук. Проверьте разрешение звука для сайта.");
    }
  }

  return <div className={styles.notifWrap}>
    <button type="button" className={styles.footButton} aria-label={`Оповещения${state.unread ? `: ${state.unread}` : ""}`} aria-expanded={open} onClick={() => {
      const next = !open;
      setOpen(next);
      if (next) {
        resetNotificationsUnread();
        pollNotificationsNow();
      }
    }}>
      <AdminIcon name="bell"/>{state.unread > 0 && <span className={styles.footBadge}>{state.unread}</span>}{enabled && <span className={styles.footOn} title="Звук новых заказов включён"/>}
    </button>
    {open && <div className={styles.notifPanel} role="region" aria-label="Новые события">
      <strong>Новые события</strong>
      {state.events.length ? <div className={styles.notifItems}>{state.events.map((event) => <Link key={event.id} href={event.kind === "booking" ? `/admin/bookings?selected=${encodeURIComponent(event.reference)}` : `/admin?selected=${encodeURIComponent(event.reference)}`} onClick={() => setOpen(false)}>{event.label}</Link>)}</div> : <p>Новых заказов и броней пока нет.</p>}
      <p role="status">{hint}</p>
      {!enabled && <button type="button" className={styles.enableSound} onClick={() => void enableSound()}>Включить звук</button>}
    </div>}
  </div>;
}
