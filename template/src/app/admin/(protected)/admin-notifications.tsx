"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { hasRecentAdminEvent, playAdminSound } from "@/lib/admin-audio";
import type { PublicAdminSound } from "@/lib/admin-sound";
import styles from "./admin-ui.module.css";

type EventItem = { id: string; kind: string; label: string; createdAt: string };
type ResponseData = { events: EventItem[]; latestId: string | null; sound: PublicAdminSound };

export function AdminNotifications() {
  const router = useRouter();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [hint, setHint] = useState("Включите звук нажатием кнопки — браузер требует вашего действия.");
  const sound = useRef<PublicAdminSound>({ selected: "standard1", customName: "", customUrl: "" });
  const latestId = useRef<string | null | undefined>(undefined);
  const enabledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let busy = false;
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
            catch { enabledRef.current = false; setEnabled(false); setHint("Браузер не воспроизвёл звук. Нажмите «Включить звук» ещё раз."); }
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
    return () => { cancelled = true; window.clearInterval(timer); window.removeEventListener("admin-sound-change", onSoundChange); };
  }, [router]);

  async function enableSound() {
    try {
      await playAdminSound(sound.current);
      enabledRef.current = true;
      setEnabled(true);
      setHint("Звук включён для этой вкладки.");
    } catch {
      setHint("Браузер не воспроизвёл звук. Проверьте разрешение звука для сайта.");
    }
  }

  return <div className={styles.notificationWrap}>
    <button type="button" className={styles.notificationButton} aria-label={`Оповещения${unread ? `: ${unread}` : ""}`} aria-expanded={open} onClick={() => { setOpen((value) => !value); setUnread(0); }}>
      🔔{unread > 0 && <span className={styles.notificationCount}>{unread}</span>}
    </button>
    {open && <div className={styles.notificationPanel} role="region" aria-label="Новые события">
      <strong>Новые события</strong>
      {events.length ? <div className={styles.notificationItems}>{events.map((event) => <Link key={event.id} href={event.kind === "booking" ? "/admin/bookings" : "/admin"} onClick={() => setOpen(false)}>{event.label}</Link>)}</div> : <p>Новых заказов и броней пока нет.</p>}
      <p role="status">{hint}</p>
      {!enabled && <button type="button" className={styles.enableSound} onClick={() => void enableSound()}>Включить звук</button>}
    </div>}
  </div>;
}
