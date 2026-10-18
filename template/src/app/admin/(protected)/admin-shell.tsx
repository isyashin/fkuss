"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { startTransition, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { logoutAction } from "./admin-shell-actions";
import { anyDirty, confirmDiscard, setDirtyAsk, useDirtyHistoryGuard } from "./admin-dirty";
import { ConfirmDialog, type ConfirmRequest } from "./confirm-dialog";
import type { AdminActor } from "@/lib/admin-users";
import { AdminNotifications } from "./admin-notifications";
import { resetNotificationsSession } from "./admin-notifications-store";
import { AdminIcon } from "./admin-icon";
import { ADMIN_PUSH_OPEN_EVENT } from "./admin-push";
import styles from "./admin-redesign.module.css";

const primary = [
  { href: "/admin", label: "Заказы", icon: "orders" },
  { href: "/admin/bookings", label: "Брони", icon: "bookings" },
  { href: "/admin/menu", label: "Меню", icon: "menu" },
  { href: "/admin/settings", label: "Настройки", icon: "settings" },
] as const;

function subscribeTheme(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("restaurant-admin-theme-change", callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener("restaurant-admin-theme-change", callback); };
}
const readTheme = () => localStorage.getItem("restaurant-admin-theme") === "dark";
const subscribeHydration = () => () => {};
const hydratedSnapshot = () => true;
const serverSnapshot = () => false;

function badgeFor(href: string, newOrdersCount: number, newBookingsCount: number) {
  if (href === "/admin" && newOrdersCount > 0) return newOrdersCount;
  if (href === "/admin/bookings" && newBookingsCount > 0) return newBookingsCount;
  return 0;
}

export function AdminShell({ children, restaurantName, logo, actor, newOrdersCount, newBookingsCount, unlocked }: {
  children: ReactNode; restaurantName: string; logo: string; actor: AdminActor;
  newOrdersCount: number; newBookingsCount: number; unlocked: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  useDirtyHistoryGuard();
  const navigating = useRef(false);
  const guardLogout = (event: React.FormEvent<HTMLFormElement>) => {
    if (!anyDirty()) { resetNotificationsSession(); return; }
    event.preventDefault();
    void confirmDiscard().then((proceed) => {
      if (proceed) {
        // The outside click closes the profile while the dialog is open, so
        // its form may already be unmounted. Invoke the action independently.
        resetNotificationsSession();
        startTransition(async () => { await logoutAction(); });
      }
    });
  };
  const profileTrigger = useRef<HTMLButtonElement | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  useEffect(() => {
    if (!profileOpen) return;
    const close = (event: KeyboardEvent | PointerEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return;
        event.preventDefault();
        setProfileOpen(false); profileTrigger.current?.focus();
      } else if (!(event.target instanceof Element && event.target.closest("[data-admin-profile]"))) {
        setProfileOpen(false);
        // Preserve focus on an outside control the user just selected.
        if (document.activeElement?.closest("[data-admin-profile]")) profileTrigger.current?.focus();
      }
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => { document.removeEventListener("keydown", close); document.removeEventListener("pointerdown", close); };
  }, [profileOpen]);
  const [logoFailed, setLogoFailed] = useState(false);
  const [dirtyDialog, setDirtyDialog] = useState<ConfirmRequest | null>(null);
  const dirtyResolverRef = useRef<((proceed: boolean) => void) | null>(null);
  // Профиль и навигация уже видны в SSR, но до гидратации нажатие пропадало.
  const hydrated = useSyncExternalStore(subscribeHydration, hydratedSnapshot, serverSnapshot);
  // F06: единый диалог подтверждения потери правок для всех «грязных» форм.
  useEffect(() => {
    setDirtyAsk((message) => new Promise<boolean>((resolve) => {
      dirtyResolverRef.current = resolve;
      setDirtyDialog({
        title: "Потерять правки?",
        text: message,
        acceptLabel: "Потерять правки",
        onAccept: () => { const resolve = dirtyResolverRef.current; dirtyResolverRef.current = null; resolve?.(true); },
      });
    }));
    return () => setDirtyAsk(null);
  }, []);
  const dark = useSyncExternalStore(subscribeTheme, readTheme, () => false);
  const changeTheme = () => { localStorage.setItem("restaurant-admin-theme", dark ? "light" : "dark"); window.dispatchEvent(new Event("restaurant-admin-theme-change")); };
  // Ручное сворачивание панели в новом дизайне отсутствует (ширина задаётся
  // брейкпоинтами), но события слушаем, чтобы старые разделы не ломались
  // до их переноса на новый язык (кнопка в Настройках станет no-op).
  useEffect(() => {
    const noop = () => {};
    window.addEventListener("restaurant-admin-sidebar-toggle", noop);
    return () => window.removeEventListener("restaurant-admin-sidebar-toggle", noop);
  }, []);
  const active = (href: string) => href === "/admin" ? pathname === href : pathname.startsWith(href);
  // Поповеры закрываются при переходе между разделами (не «прилипают» поверх контента).
  // Корректировка состояния во время рендера (react-compiler: не setState в эффекте).
  const [popPath, setPopPath] = useState(pathname);
  if (popPath !== pathname) { setPopPath(pathname); setProfileOpen(false); }
  const fullAccess = actor.role === "owner" || unlocked;
  // Сотрудник: заказы, брони, меню + настройки (владельческие разделы — через PIN).
  // По прототипу навигация — ровно четыре пункта; владельческие задачи живут внутри «Настроек».
  const visiblePrimary = fullAccess
    ? primary
    : primary.filter((item) => ["/admin", "/admin/bookings", "/admin/menu", "/admin/settings"].includes(item.href));
  const initials = actor.name.trim().split(/\s+/).slice(0, 2).map((part) => part.slice(0, 1).toLocaleUpperCase("ru-RU")).join("") || "А";

  const navLinks = (navStyles: "rail" | "bottom") => visiblePrimary.map((item) => {
    const badge = badgeFor(item.href, newOrdersCount, newBookingsCount);
    return navStyles === "rail" ? (
      <Link key={item.href} href={item.href} className={`${styles.navLink} ${active(item.href) ? styles.current : ""}`} aria-current={active(item.href) ? "page" : undefined} aria-label={item.label} title={item.label}>
        <AdminIcon name={item.icon} size={22} />
        <span>{item.label}</span>
        {badge > 0 && <em className={styles.navBadge} aria-label={`Необработанных: ${badge}`}>{badge}</em>}
      </Link>
    ) : (
      <Link key={item.href} href={item.href} className={active(item.href) ? styles.current : ""} aria-current={active(item.href) ? "page" : undefined}>
        <AdminIcon name={item.icon} />
        <span>{item.label}</span>
        {badge > 0 && <em aria-label={`Необработанных: ${badge}`}>{badge}</em>}
      </Link>
    );
  });

  const brand = (
    <>
      <span className={styles.logo}>{logo && !logoFailed ? <Image src={logo} width={40} height={40} alt="" unoptimized onError={() => setLogoFailed(true)} /> : restaurantName.slice(0, 1)}</span>
      <span className={styles.brandText}><strong>{restaurantName}</strong><small>Панель ресторана</small></span>
    </>
  );

  return <div className={styles.shell} data-theme={dark ? "dark" : "light"} inert={!hydrated} aria-busy={!hydrated}
    onClickCapture={(event) => {
      if (!anyDirty() || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.download || (anchor.target && anchor.target !== "_self")) return;
      const target = new URL(anchor.href, location.href);
      if (target.origin !== location.origin || target.pathname + target.search === location.pathname + location.search) return;
      event.preventDefault(); event.stopPropagation();
      if (navigating.current) return;
      navigating.current = true;
      void confirmDiscard().then((proceed) => {
        navigating.current = false;
        if (proceed) router.push(target.pathname + target.search + target.hash);
      });
    }}>
    <aside className={styles.rail} aria-label="Панель ресторана">
      <Link href="/admin" className={styles.brand} aria-label={`${restaurantName}: заказы`}>{brand}</Link>
      <nav className={styles.primaryNav} aria-label="Главная навигация">{navLinks("rail")}</nav>
      <div className={styles.railFoot}>
        <AdminNotifications actorId={actor.id} initialOrders={newOrdersCount} initialBookings={newBookingsCount} />
        <div className={styles.popWrap} data-admin-profile>
          <button type="button" disabled={!hydrated} className={styles.footButton} onClick={(event) => { profileTrigger.current = event.currentTarget; setProfileOpen((value) => !value); }} aria-expanded={profileOpen} aria-label={`Профиль: ${actor.name}`}>
            <AdminIcon name="settings" size={20} />
            <span>{actor.name}</span>
          </button>
          {profileOpen && (
            <div className={styles.profilePopover}>
              <strong>{actor.name}</strong>
              <small>{actor.role === "owner" ? "Владелец" : "Сотрудник"}</small>
              <nav aria-label="Профиль">
                <button type="button" onClick={changeTheme} aria-pressed={dark}>{dark ? "☀ Светлая тема" : "☾ Тёмная тема"}</button>
                <button type="button" onClick={() => { setProfileOpen(false); window.dispatchEvent(new CustomEvent(ADMIN_PUSH_OPEN_EVENT)); }}>Уведомления на этом устройстве</button>
                <Link href="/" onClick={() => setProfileOpen(false)}>Открыть сайт ↗</Link>
                <form action={logoutAction} onSubmit={guardLogout}><button type="submit">Выйти</button></form>
              </nav>
            </div>
          )}
        </div>
      </div>
    </aside>

    <div className={styles.workspace}>
      <header className={styles.topbar}>
        <span className={styles.logo}>{logo && !logoFailed ? <Image src={logo} width={34} height={34} alt="" unoptimized onError={() => setLogoFailed(true)} /> : restaurantName.slice(0, 1)}</span>
        <strong>{restaurantName}</strong>
        <AdminNotifications actorId={actor.id} initialOrders={newOrdersCount} initialBookings={newBookingsCount} />
        <div className={styles.popWrap} data-admin-profile>
          <button type="button" disabled={!hydrated} className={styles.footButton} onClick={(event) => { profileTrigger.current = event.currentTarget; setProfileOpen((value) => !value); }} aria-expanded={profileOpen} aria-label={`Профиль: ${actor.name}`}>
            <span className={styles.footBadge} style={{ background: "rgba(255,255,255,.16)", color: "#fff" }}>{initials}</span>
          </button>
          {profileOpen && (
            <div className={styles.profilePopover}>
              <strong>{actor.name}</strong>
              <small>{actor.role === "owner" ? "Владелец" : "Сотрудник"}</small>
              <nav aria-label="Профиль">
                <button type="button" onClick={changeTheme} aria-pressed={dark}>{dark ? "☀ Светлая тема" : "☾ Тёмная тема"}</button>
                <button type="button" onClick={() => { setProfileOpen(false); window.dispatchEvent(new CustomEvent(ADMIN_PUSH_OPEN_EVENT)); }}>Уведомления на этом устройстве</button>
                <Link href="/" onClick={() => setProfileOpen(false)}>Открыть сайт ↗</Link>
                <form action={logoutAction} onSubmit={guardLogout}><button type="submit">Выйти</button></form>
              </nav>
            </div>
          )}
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </div>

    <nav className={styles.bottomNav} aria-label="Мобильная навигация">{navLinks("bottom")}</nav>
    <ConfirmDialog
      request={dirtyDialog}
      onClose={() => {
        dirtyResolverRef.current?.(false);
        dirtyResolverRef.current = null;
        setDirtyDialog(null);
      }}
    />
  </div>;
}
