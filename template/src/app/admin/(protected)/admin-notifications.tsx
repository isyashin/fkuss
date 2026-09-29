"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { hasRecentAdminEvent, playAdminSound, primeAdminAudio } from "@/lib/admin-audio";
import { setFaviconBadge, clearFaviconBadge } from "@/lib/favicon-badge";
import type { PublicAdminSound } from "@/lib/admin-sound";
import styles from "./admin-ui.module.css";
import { AdminIcon } from "./admin-icon";

type EventItem = { id: string; kind: string; label: string; createdAt: string };
type ResponseData = { events: EventItem[]; latestId: string | null; sound: PublicAdminSound };

const ENABLED_KEY = "admin-sound-on";
const ENABLED_EVENT = "admin-sound-flag";
const DEFAULT_HINT = "Включите звук нажатием кнопки — браузер требует вашего действия.";

function readEnabledFlag(): boolean {
  try { return sessionStorage.getItem(ENABLED_KEY) === "1"; } catch { return false; }
}
function writeEnabledFlag(value: boolean) {
  try {
    if (value) sessionStorage.setItem(ENABLED_KEY, "1");
    else sessionStorage.removeItem(ENABLED_KEY);
  } catch { /* private mode */ }
}
function subscribeEnabled(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(ENABLED_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(ENABLED_EVENT, callback);
  };
}

export function AdminNotifications() {
  const router = useRouter();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  // sessionStorage — источник истины: серверный снапшот false совпадает с SSR,
  // после гидрации читается реальное значение (без рассинхрона #418).
  const enabled = useSyncExternalStore(subscribeEnabled, readEnabledFlag, () => false);
  const [errorHint, setErrorHint] = useState<string | null>(null);
  const hint = errorHint ?? (enabled ? "Звук включён для этой вкладки." : DEFAULT_HINT);
  const sound = useRef<PublicAdminSound>({ selected: "standard1", customName: "", customUrl: "" });
  const latestId = useRef<string | null | undefined>(undefined);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  // Бейдж на фавиконе: счёт новых заказов+броней; снимается при открытии панели (unread=0).
  useEffect(() => {
    if (unread > 0) void setFaviconBadge(unread);
    else clearFaviconBadge();
  }, [unread]);

  function setSoundEnabled(value: boolean) {
    writeEnabledFlag(value);
    window.dispatchEvent(new Event(ENABLED_EVENT));
  }

  useEffect(() => {
    let cancelled = false;
    let busy = false;
    // Первый клик в документе беззвучно будит AudioContext — без отдельной кнопки.
    const onFirstGesture = () => {
      void primeAdminAudio().then((ok) => {
        if (cancelled || !ok || enabledRef.current) return;
        setSoundEnabled(true);
      });
    };
    document.addEventListener("click", onFirstGesture, { once: true });

    async function poll() {
      if (busy || cancelled) return;
      busy = true;
      try {
        const response = await fetch("/api/admin/events", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as ResponseData;
        if (cancelled) return;
        sound.current = data.sound;
        if (data.events.length || (latestId.current !== undefined && latestId.current !== data.latestId)) router.refresh();
        latestId.current = data.latestId;
        if (data.events.length) {
          setEvents((previous) => [...data.events, ...previous].slice(0, 10));
          setUnread((previous) => Math.min(99, previous + data.events.length));
          if (enabledRef.current && hasRecentAdminEvent(data.events)) {
            try { await playAdminSound(data.sound); }
            catch {
              setSoundEnabled(false);
              setErrorHint("Браузер не воспроизвёл звук. Нажмите «Включить звук» ещё раз.");
            }
          }
        }
      } catch {
        // Следующий опрос восстановит соединение.
      } finally { busy = false; }
    }
    void poll();
    const timer = window.setInterval(() => void poll(), 10000);
    const onSoundChange = (event: Event) => { sound.current = (event as CustomEvent<PublicAdminSound>).detail; };
    window.addEventListener("admin-sound-change", onSoundChange);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("click", onFirstGesture);
      window.removeEventListener("admin-sound-change", onSoundChange);
    };
  }, [router]);

  async function enableSound() {
    try {
      await playAdminSound(sound.current);
      setErrorHint(null);
      setSoundEnabled(true);
    } catch {
      setErrorHint("Браузер не воспроизвёл звук. Проверьте разрешение звука для сайта.");
    }
  }

  return <div className={styles.notificationWrap}>
    <button type="button" className={styles.notificationButton} aria-label={`Оповещения${unread ? `: ${unread}` : ""}`} aria-expanded={open} onClick={() => { setOpen((value) => !value); setUnread(0); }}>
      <AdminIcon name="bell"/>{unread > 0 && <span className={styles.notificationCount}>{unread}</span>}{enabled && <span className={styles.notificationOn} title="Звук новых заказов включён"/>}
    </button>
    {open && <div className={styles.notificationPanel} role="region" aria-label="Новые события">
      <strong>Новые события</strong>
      {events.length ? <div className={styles.notificationItems}>{events.map((event) => <Link key={event.id} href={event.kind === "booking" ? "/admin/bookings" : "/admin"} onClick={() => setOpen(false)}>{event.label}</Link>)}</div> : <p>Новых заказов и броней пока нет.</p>}
      <p role="status">{hint}</p>
      {!enabled && <button type="button" className={styles.enableSound} onClick={() => void enableSound()}>Включить звук</button>}
    </div>}
  </div>;
}
