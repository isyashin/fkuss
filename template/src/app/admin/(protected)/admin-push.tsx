"use client";

/**
 * Управление установкой админского приложения и web push на ЭТОМ устройстве.
 * Доступно сотруднику и владельцу без PIN — живёт поверх рабочей оболочки.
 * Финальный триггер после редизайна — в поповере профиля (см. интеграцию PR #35).
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AdminIcon } from "./admin-icon";
import styles from "./admin-push.module.css";

const INSTALL_KEY = "admin-install-id";
const THEME_KEY = "restaurant-admin-theme";

type PushConfig = { enabled: boolean; publicKey: string | null; subscribed: boolean; stale: boolean };

type Support = "unknown" | "unsupported" | "ready";

function readDark() {
  return typeof window !== "undefined" && localStorage.getItem(THEME_KEY) === "dark";
}

function subscribeTheme(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("restaurant-admin-theme-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("restaurant-admin-theme-change", callback);
  };
}

/** Стабильный идентификатор установки приложения на устройстве (per-site localStorage). */
export function getAdminInstallId(): string {
  let id = localStorage.getItem(INSTALL_KEY);
  if (!id) {
    const bytes = new Uint8Array(18);
    crypto.getRandomValues(bytes);
    id = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    localStorage.setItem(INSTALL_KEY, id);
  }
  return id;
}

export function isPushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

/** Регистрация service worker админки. Без UI: вызывается и на странице входа. */
export function AdminPushManager() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/admin/sw.js", { scope: "/admin/", updateViaCache: "none" }).catch(() => {});
  }, []);
  return null;
}

export function AdminPushPanel() {
  const dark = useSyncExternalStore(subscribeTheme, readDark, () => false);
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<PushConfig | null>(null);
  const [support, setSupport] = useState<Support>("unknown");
  const [permission, setPermission] = useState<typeof Notification.permission>("default");
  const [standalone, setStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [secure, setSecure] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<{ prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> } | null>(null);

  const installId = useRef("");

  const refresh = useCallback(async () => {
    if (!installId.current) return;
    try {
      const response = await fetch(`/api/admin/push/config?installId=${encodeURIComponent(installId.current)}`, {
        headers: { "Cache-Control": "no-store" },
      });
      if (response.ok) setConfig((await response.json()) as PushConfig);
    } catch {
      // конфиг недоступен — оставляем прежнее состояние
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      installId.current = getAdminInstallId();
      setSupport(isPushSupported() ? "ready" : "unsupported");
      setSecure(window.isSecureContext);
      setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));
      setStandalone(window.matchMedia("(display-mode: standalone)").matches);
      if ("Notification" in window) setPermission(Notification.permission);
      const handler = (event: Event) => {
        event.preventDefault();
        setInstallPrompt(event as unknown as { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> });
      };
      window.addEventListener("beforeinstallprompt", handler);
      // Авторизованное открытие приложения продлевает срок действия подписки устройства
      void fetch("/api/admin/push/subscribe", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installId: installId.current }),
      }).catch(() => {});
      void refresh();
      return () => window.removeEventListener("beforeinstallprompt", handler);
    });
  }, [refresh]);

  const enable = async () => {
    if (!config?.publicKey || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(config.publicKey) as BufferSource,
        });
      }
      const json = subscription.toJSON();
      const response = await fetch("/api/admin/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          installId: installId.current,
          endpoint: subscription.endpoint,
          keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
          userAgent: navigator.userAgent.slice(0, 200),
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Не удалось включить уведомления");
      }
      if ("Notification" in window) setPermission(Notification.permission);
      setMessage({ kind: "info", text: "Уведомления включены на этом устройстве." });
      await refresh();
    } catch (error) {
      if ("Notification" in window && Notification.permission === "denied") {
        setMessage({
          kind: "error",
          text: "Разрешение на уведомления отклонено. Включите его в настройках сайта вашего браузера, затем повторите.",
        });
      } else {
        setMessage({
          kind: "error",
          text: error instanceof Error && error.message ? error.message : "Не удалось включить уведомления. Попробуйте ещё раз.",
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      await subscription?.unsubscribe();
      await fetch("/api/admin/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installId: installId.current }),
      });
      setMessage({ kind: "info", text: "Уведомления на этом устройстве выключены. Остальные устройства продолжают получать." });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/push/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installId: installId.current }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string; stale?: boolean } | null;
      if (!response.ok) {
        setMessage({ kind: "error", text: body?.error ?? "Не удалось отправить проверку." });
        if (body?.stale) await refresh();
      } else {
        setMessage({ kind: "info", text: "Проверка отправлена. Если уведомление не появилось, проверьте звук, фокус-режим и разрешения телефона." });
      }
    } finally {
      setBusy(false);
    }
  };

  const install = async () => {
    const prompt = installPrompt;
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") {
      setMessage({ kind: "info", text: "Приложение установлено. Найдите его значок на рабочем столе." });
    }
    setInstallPrompt(null);
  };

  const pushUnavailableReason = (): string | null => {
    if (support === "unsupported") return "Этот браузер не поддерживает push-уведомления. Откройте админку в актуальном Chrome, Edge или Safari.";
    if (!secure) return "Для уведомлений нужен защищённый адрес (HTTPS). Откройте админку по основному адресу сайта.";
    if (!config) return null;
    if (!config.enabled) return "Push-уведомления не настроены для этого сайта. Ключи задаёт владелец платформы в настройках сайта.";
    if (isIOS && !standalone) return "На iPhone уведомления работают только в установленном приложении. Сначала добавьте админку на экран «Домой» (кнопка ниже), затем включите уведомления уже в установленном приложении.";
    if (permission === "denied") return "Уведомления запрещены в настройках браузера. Разрешите их для этого сайта, затем повторите.";
    return null;
  };

  const unavailable = pushUnavailableReason();
  const subscribed = Boolean(config?.subscribed && !config?.stale);

  return (
    <div className={`${styles.panel} ${dark ? styles.dark : ""}`}>
      <button type="button" className={styles.fab} aria-label="Установка и уведомления на этом устройстве" onClick={() => setOpen(true)}>
        <AdminIcon name="bell" size={22} />
      </button>

      {open && (
        <div className={styles.backdrop} role="presentation" onClick={() => setOpen(false)}>
          <div className={styles.sheetWrap} role="dialog" aria-modal="true" aria-label="Установка и уведомления" onClick={(e) => e.stopPropagation()}>
            <button type="button" className={styles.close} aria-label="Закрыть" onClick={() => setOpen(false)}>×</button>
            <h2>Это устройство</h2>

            <section className={styles.section} aria-label="Установка приложения">
              <h3>Приложение админки</h3>
              {standalone ? (
                <p className={`${styles.status} ${styles.ok}`}>Установлено. Значок админки — на рабочем столе.</p>
              ) : (
                <>
                  {installPrompt ? (
                    <div className={styles.row}>
                      <button type="button" className={`${styles.btn} ${styles.primary}`} onClick={() => void install()}>Установить приложение</button>
                    </div>
                  ) : isIOS ? (
                    <div className={styles.row}>
                      <button type="button" className={styles.btn} onClick={() => setShowIosHelp((v) => !v)}>Как установить на iPhone</button>
                    </div>
                  ) : (
                    <p className={styles.note}>
                      Установите админку на главный экран: откройте меню браузера и выберите «Установить приложение».
                      Гостевое приложение сайта при этом не меняется.
                    </p>
                  )}
                  {showIosHelp && (
                    <ol className={styles.help}>
                      <li>Откройте админку в Safari.</li>
                      <li>Нажмите кнопку «Поделиться» (квадрат со стрелкой вверх).</li>
                      <li>Выберите «На экран “Домой”» и нажмите «Добавить».</li>
                      <li>Откройте админку с рабочего стола — только установленному приложению Safari разрешает уведомления.</li>
                    </ol>
                  )}
                </>
              )}
            </section>

            <section className={styles.section} aria-label="Push-уведомления">
              <h3>Уведомления о заказах и бронях</h3>
              {unavailable ? (
                <p className={styles.note}>{unavailable}</p>
              ) : subscribed ? (
                <>
                  <p className={`${styles.status} ${styles.ok}`}>Уведомления включены на этом устройстве.</p>
                  <div className={styles.row}>
                    <button type="button" className={styles.btn} disabled={busy} onClick={() => void sendTest()}>Проверить</button>
                    <button type="button" className={styles.btn} disabled={busy} onClick={() => void disable()}>Выключить</button>
                  </div>
                  <p className={styles.note}>
                    Новый заказ или бронь придёт на этот телефон, даже когда приложение закрыто. Звук открытой
                    вкладки продолжает работать по-прежнему; показ и звук уведомления зависят от настроек телефона и режима фокусирования.
                  </p>
                </>
              ) : (
                <>
                  <p className={styles.note}>
                    При включении телефон спросит разрешение на уведомления — подтвердите его, иначе доставка не сможет работать.
                  </p>
                  <div className={styles.row}>
                    <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={busy} onClick={() => void enable()}>Включить уведомления</button>
                  </div>
                </>
              )}
              {message && <p className={`${styles.message} ${styles[message.kind]}`} role={message.kind === "error" ? "alert" : "status"}>{message.text}</p>}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
