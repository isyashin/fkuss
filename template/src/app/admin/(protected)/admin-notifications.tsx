"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { hasRecentAdminEvent, playAdminSound, primeAdminAudio } from "@/lib/admin-audio";
import { setFaviconBadge, clearFaviconBadge } from "@/lib/favicon-badge";
import type { PublicAdminSound } from "@/lib/admin-sound";
import styles from "./admin-redesign.module.css";
import { AdminIcon } from "./admin-icon";

type EventItem = { id: string; kind: string; label: string; createdAt: string; status?: string | null };
type ResponseData = {
  events: EventItem[];
  latestId: string | null;
  sound: PublicAdminSound;
  pending: { orders: number; bookings: number };
};

const ENABLED_KEY = "admin-sound-on";
const ENABLED_EVENT = "admin-sound-flag";
const TAB_KEY = "admin-tab-id";
const DEFAULT_HINT = "Включите звук нажатием кнопки — браузер требует вашего действия.";
const DEFAULT_REPEATS = 10;
const REPEAT_GAP_MS = 1800;

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
function randomId(): string {
  try {
    // crypto.randomUUID недоступен вне secure context (http в LAN) — getRandomValues доступен везде
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}
function tabId(): string {
  try {
    let id = sessionStorage.getItem(TAB_KEY);
    if (!id) {
      id = randomId();
      sessionStorage.setItem(TAB_KEY, id);
    }
    return id;
  } catch {
    return randomId();
  }
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
  const sound = useRef<PublicAdminSound>({ selected: "standard1", customName: "", customUrl: "", repeats: DEFAULT_REPEATS });
  const latestId = useRef<string | null | undefined>(undefined);
  const enabledRef = useRef(enabled);
  const pendingRef = useRef({ orders: 0, bookings: 0 });
  const [pendingCounts, setPendingCounts] = useState({ orders: 0, bookings: 0 });

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  // Бейдж на фавиконе = необработанные заказы + брони (как в сайдбаре):
  // гаснет только когда их реально обработали, а не от взгляда на колокольчик.
  useEffect(() => {
    const total = pendingCounts.orders + pendingCounts.bookings;
    if (total > 0) void setFaviconBadge(total);
    else clearFaviconBadge();
  }, [pendingCounts]);

  function setSoundEnabled(value: boolean) {
    writeEnabledFlag(value);
    window.dispatchEvent(new Event(ENABLED_EVENT));
  }

  useEffect(() => {
    let cancelled = false;
    let busy = false;
    // Цикл повторения звука: до ALERT_REPEATS раз или пока заказы/брони не обработаны.
    // Живёт внутри эффекта — только опрос его запускает.
    const loopRefInner: { current: { remaining: number; kinds: Set<string> } | null } = { current: null };

    const shouldKeepLooping = (): boolean => {
      const current = loopRefInner.current;
      if (!current) return false;
      const { orders, bookings } = pendingRef.current;
      if (current.kinds.has("order") && orders > 0) return true;
      if (current.kinds.has("booking") && bookings > 0) return true;
      return false;
    };

    const loopTick = async (): Promise<void> => {
      const current = loopRefInner.current;
      if (!current) return;
      if (current.remaining <= 0 || !shouldKeepLooping()) {
        loopRefInner.current = null;
        return;
      }
      current.remaining -= 1;
      try {
        await playAdminSound(sound.current);
      } catch {
        loopRefInner.current = null;
        setSoundEnabled(false);
        setErrorHint("Браузер не воспроизвёл звук. Нажмите «Включить звук» ещё раз.");
        return;
      }
      window.setTimeout(() => void loopTick(), REPEAT_GAP_MS);
    };

    const startAlertLoop = (kinds: string[]): void => {
      const repeats = Number.isInteger(sound.current.repeats) && sound.current.repeats > 0 ? sound.current.repeats : DEFAULT_REPEATS;
      let current = loopRefInner.current;
      if (!current) {
        current = { remaining: repeats, kinds: new Set() };
        loopRefInner.current = current;
        for (const kind of kinds) current.kinds.add(kind);
        void loopTick();
        return;
      }
      // Цепочка уже крутится: продлеваем серию и добавляем виды событий
      for (const kind of kinds) current.kinds.add(kind);
      current.remaining = repeats;
    };

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
        const response = await fetch("/api/admin/events", {
          cache: "no-store",
          headers: { "X-Admin-Tab": tabId() },
        });
        if (!response.ok) return;
        const data = await response.json() as ResponseData;
        if (cancelled) return;
        sound.current = data.sound;
        pendingRef.current = data.pending;
        setPendingCounts(data.pending);
        if (data.events.length || (latestId.current !== undefined && latestId.current !== data.latestId)) router.refresh();
        latestId.current = data.latestId;
        if (data.events.length) {
          setEvents((previous) => [...data.events, ...previous].slice(0, 10));
          setUnread((previous) => Math.min(99, previous + data.events.length));
          if (enabledRef.current && hasRecentAdminEvent(data.events)) {
            startAlertLoop(data.events.map((event) => event.kind));
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

  return <div className={styles.notifWrap}>
    <button type="button" className={styles.footButton} aria-label={`Оповещения${unread ? `: ${unread}` : ""}`} aria-expanded={open} onClick={() => { setOpen((value) => !value); setUnread(0); }}>
      <AdminIcon name="bell"/>{unread > 0 && <span className={styles.footBadge}>{unread}</span>}{enabled && <span className={styles.footOn} title="Звук новых заказов включён"/>}
    </button>
    {open && <div className={styles.notifPanel} role="region" aria-label="Новые события">
      <strong>Новые события</strong>
      {events.length ? <div className={styles.notifItems}>{events.map((event) => <Link key={event.id} href={event.kind === "booking" ? "/admin/bookings" : "/admin"} onClick={() => setOpen(false)}>{event.label}</Link>)}</div> : <p>Новых заказов и броней пока нет.</p>}
      <p role="status">{hint}</p>
      {!enabled && <button type="button" className={styles.enableSound} onClick={() => void enableSound()}>Включить звук</button>}
    </div>}
  </div>;
}
