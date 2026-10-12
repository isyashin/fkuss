"use client";

/**
 * Общий стор оповещений админки: ОДИН поллер на вкладку, сколько бы экземпляров
 * AdminNotifications ни рендерила оболочка (rail + topbar после редизайна).
 * Иначе два экземпляра с общим tabId гонялись за receipt события: проигравший
 * вечно показывал пустую панель и молчал звуком. События, счётчики, звуковая
 * серия и бейдж фавикона живут здесь; экземпляры только подписываются.
 */
import { setFaviconBadge, clearFaviconBadge } from "@/lib/favicon-badge";
import { hasRecentAdminEvent, playAdminSound, primeAdminAudio } from "@/lib/admin-audio";
import { DEFAULT_SOUND_REPEATS } from "@/lib/admin-sound-constants";
import type { PublicAdminSound } from "@/lib/admin-sound";

/** Пауза между повторами сигнала (как раньше в компоненте). */
const REPEAT_GAP_MS = 1800;

export type AdminEventItem = { id: string; kind: string; reference: string; label: string; createdAt: string; status?: string | null };
export type AdminNotificationsState = {
  events: AdminEventItem[];
  unread: number;
  pending: { orders: number; bookings: number };
  sound: PublicAdminSound;
  error: string | null;
  /** Меняется при каждом ответе с новыми данными — триггер router.refresh(). */
  latestId: string | null;
  refreshTick: number;
};

const DEFAULT_SOUND: PublicAdminSound = { selected: "standard1", customName: "", customUrl: "", repeats: DEFAULT_SOUND_REPEATS };

// НЕ мутируем объект: useSyncExternalStore сравнивает снапшот по ссылке —
// новое состояние обязано быть новым объектом, иначе ре-рендера не будет.
let state: AdminNotificationsState = {
  events: [],
  unread: 0,
  pending: { orders: 0, bookings: 0 },
  sound: DEFAULT_SOUND,
  error: null,
  latestId: null,
  refreshTick: 0,
};

const listeners = new Set<() => void>();
function emit(next: Partial<AdminNotificationsState>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

export function getNotificationsSnapshot(): AdminNotificationsState {
  return state;
}

export function subscribeNotifications(listener: () => void): () => void {
  listeners.add(listener);
  startPolling();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopPolling();
  };
}

/** Звук вкл/выкл для вкладки (sessionStorage) — общий для экземпляров. */
const ENABLED_KEY = "admin-sound-on";
const ENABLED_EVENT = "admin-sound-toggle";
export function readSoundEnabled(): boolean {
  try {
    return sessionStorage.getItem(ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}
export function writeSoundEnabled(value: boolean) {
  try {
    if (value) sessionStorage.setItem(ENABLED_KEY, "1");
    else sessionStorage.removeItem(ENABLED_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(ENABLED_EVENT));
}
export function subscribeSoundEnabled(listener: () => void): () => void {
  window.addEventListener(ENABLED_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(ENABLED_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}

function tabId(): string {
  try {
    const KEY = "admin-tab-id";
    let id = sessionStorage.getItem(KEY);
    if (!id) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      id = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      sessionStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "default";
  }
}

type ResponseData = {
  events: AdminEventItem[];
  latestId: string | null;
  sound: PublicAdminSound;
  pending: { orders: number; bookings: number };
};

let timer: number | null = null;
let busy = false;
let started = false;
let gestureBound = false;
let prevLatestId: string | null | undefined = undefined;

/** Сброс счётчика непрочитанных (взгляд в панель). */
export function resetNotificationsUnread(): void {
  if (state.unread !== 0) emit({ unread: 0 });
}

/** Текст ошибки звука — из стора, чтобы оба экземпляра видели одно. */
export function setNotificationsError(text: string | null): void {
  if (state.error !== text) emit({ error: text });
}

// Звуковая серия: одна на вкладку, продлевается новыми событиями.
const alertLoop: { remaining: number; kinds: Set<string> } = { remaining: 0, kinds: new Set() };
let alertLoopActive = false;

function shouldKeepLooping(): boolean {
  if (!alertLoopActive) return false;
  const { orders, bookings } = state.pending;
  if (alertLoop.kinds.has("order") && orders > 0) return true;
  if (alertLoop.kinds.has("booking") && bookings > 0) return true;
  return false;
}

async function loopTick(): Promise<void> {
  if (!alertLoopActive) return;
  if (alertLoop.remaining <= 0 || !shouldKeepLooping()) {
    alertLoopActive = false;
    alertLoop.kinds.clear();
    return;
  }
  alertLoop.remaining -= 1;
  try {
    await playAdminSound(state.sound);
  } catch {
    alertLoopActive = false;
    alertLoop.kinds.clear();
    writeSoundEnabled(false);
    emit({ error: "Браузер не воспроизвёл звук. Нажмите «Включить звук» ещё раз." });
    return;
  }
  window.setTimeout(() => void loopTick(), REPEAT_GAP_MS);
}

function startAlertLoop(kinds: string[]): void {
  const repeats = Number.isInteger(state.sound.repeats) && state.sound.repeats > 0 ? state.sound.repeats : DEFAULT_SOUND_REPEATS;
  if (!alertLoopActive) {
    alertLoopActive = true;
    alertLoop.remaining = repeats;
    alertLoop.kinds = new Set(kinds);
    void loopTick();
    return;
  }
  for (const kind of kinds) alertLoop.kinds.add(kind);
  alertLoop.remaining = repeats;
}

function bindFirstGesture() {
  if (gestureBound) return;
  gestureBound = true;
  document.addEventListener(
    "click",
    () => {
      void primeAdminAudio().then((ok) => {
        if (ok && !readSoundEnabled()) writeSoundEnabled(true);
      });
    },
    { once: true },
  );
  // Выбор сигнала в настройках звука — обновляем текущий звук без ожидания опроса
  window.addEventListener("admin-sound-change", (event) => {
    emit({ sound: (event as CustomEvent<PublicAdminSound>).detail });
  });
}

async function poll(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const response = await fetch("/api/admin/events", { cache: "no-store", headers: { "X-Admin-Tab": tabId() } });
    if (!response.ok) return;
    const data = (await response.json()) as ResponseData;
    const known = new Set(state.events.map((event) => event.id));
    // Сервер отдаёт события по возрастанию createdAt; нам нужны НОВЫЕ сверху —
    // иначе при первом опросе пачкой (>10) панель навсегда показывала старые.
    const fresh = data.events.filter((event) => !known.has(event.id)).reverse();
    const events = [...fresh, ...state.events].slice(0, 10);
    const unread = Math.min(99, state.unread + fresh.length);
    const total = data.pending.orders + data.pending.bookings;
    if (total > 0) void setFaviconBadge(total);
    else clearFaviconBadge();
    // router.refresh() только когда реально что-то изменилось (как раньше):
    // новые события или сдвинулся latestId — иначе бесконечный фоновый рефреш.
    const shouldRefresh = fresh.length > 0 || (prevLatestId !== undefined && prevLatestId !== data.latestId);
    prevLatestId = data.latestId;
    emit({
      events,
      unread,
      pending: data.pending,
      sound: data.sound,
      error: null,
      latestId: data.latestId,
      ...(shouldRefresh ? { refreshTick: state.refreshTick + 1 } : {}),
    });
    if (fresh.length && readSoundEnabled() && hasRecentAdminEvent(data.events)) {
      startAlertLoop(data.events.map((event) => event.kind));
    }
  } catch {
    // сеть/сервер недоступны — следующий тик попробует снова
  } finally {
    busy = false;
  }
}

function startPolling(): void {
  if (started) return;
  started = true;
  bindFirstGesture();
  void poll();
  timer = window.setInterval(() => void poll(), 10_000);
}

function stopPolling(): void {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
  started = false;
  alertLoopActive = false;
}

/** Немедленный опрос (открытие панели — не ждём interval). */
export function pollNotificationsNow(): void {
  void poll();
}
