"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { logoutAction } from "./admin-shell-actions";
import type { AdminActor } from "@/lib/admin-users";
import { AdminNotifications } from "./admin-notifications";
import { AdminIcon } from "./admin-icon";
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
  const [profileOpen, setProfileOpen] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
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

  return <div className={styles.shell} data-theme={dark ? "dark" : "light"}>
    <aside className={styles.rail} aria-label="Панель ресторана">
      <Link href="/admin" className={styles.brand} aria-label={`${restaurantName}: заказы`}>{brand}</Link>
      <nav className={styles.primaryNav} aria-label="Главная навигация">{navLinks("rail")}</nav>
      <div className={styles.railFoot}>
        <AdminNotifications />
        <div className={styles.popWrap}>
          <button type="button" className={styles.footButton} onClick={() => setProfileOpen((value) => !value)} aria-expanded={profileOpen} aria-label={`Профиль: ${actor.name}`}>
            <AdminIcon name="settings" size={20} />
            <span>{actor.name}</span>
          </button>
          {profileOpen && (
            <div className={styles.profilePopover}>
              <strong>{actor.name}</strong>
              <small>{actor.role === "owner" ? "Владелец" : "Сотрудник"}</small>
              <nav aria-label="Профиль">
                <button type="button" onClick={changeTheme} aria-pressed={dark}>{dark ? "☀ Светлая тема" : "☾ Тёмная тема"}</button>
                <Link href="/" onClick={() => setProfileOpen(false)}>Открыть сайт ↗</Link>
                <form action={logoutAction}><button type="submit">Выйти</button></form>
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
        <AdminNotifications />
        <div className={styles.popWrap}>
          <button type="button" className={styles.footButton} onClick={() => setProfileOpen((value) => !value)} aria-expanded={profileOpen} aria-label={`Профиль: ${actor.name}`}>
            <span className={styles.footBadge} style={{ background: "rgba(255,255,255,.16)", color: "#fff" }}>{initials}</span>
          </button>
          {profileOpen && (
            <div className={styles.profilePopover}>
              <strong>{actor.name}</strong>
              <small>{actor.role === "owner" ? "Владелец" : "Сотрудник"}</small>
              <nav aria-label="Профиль">
                <button type="button" onClick={changeTheme} aria-pressed={dark}>{dark ? "☀ Светлая тема" : "☾ Тёмная тема"}</button>
                <Link href="/" onClick={() => setProfileOpen(false)}>Открыть сайт ↗</Link>
                <form action={logoutAction}><button type="submit">Выйти</button></form>
              </nav>
            </div>
          )}
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </div>

    <nav className={styles.bottomNav} aria-label="Мобильная навигация">{navLinks("bottom")}</nav>
  </div>;
}
