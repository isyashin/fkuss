"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { logoutAction } from "./admin-shell-actions";
import type { AdminActor } from "@/lib/admin-users";
import { AdminNotifications } from "./admin-notifications";
import { AdminIcon } from "./admin-icon";
import styles from "./admin-ui.module.css";

const primary = [
  { href: "/admin", label: "Заказы", icon: "orders" },
  { href: "/admin/bookings", label: "Брони", icon: "bookings" },
  { href: "/admin/menu", label: "Меню", icon: "menu" },
  { href: "/admin/settings", label: "Настройки", icon: "settings" },
] as const;
const secondary = [
  { href: "/admin/promos", label: "Акции" }, { href: "/admin/gallery", label: "Галерея" },
  { href: "/admin/banquets", label: "Банкеты" }, { href: "/admin/pages", label: "Страницы" },
  { href: "/admin/restaurant", label: "Ресторан" }, { href: "/admin/sync", label: "Синхронизация" },
  { href: "/admin/delivery", label: "Доставка" }, { href: "/admin/print-materials", label: "Печать" },
  { href: "/admin/billing", label: "Подписка" }, { href: "/admin/team", label: "Сотрудники" },
] as const;

function subscribeTheme(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("restaurant-admin-theme-change", callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener("restaurant-admin-theme-change", callback); };
}
const readTheme = () => localStorage.getItem("restaurant-admin-theme") === "dark";

export function AdminShell({ children, restaurantName, logo, actor, newOrdersCount, newBookingsCount }: {
  children: ReactNode; restaurantName: string; logo: string; actor: AdminActor;
  newOrdersCount: number; newBookingsCount: number;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const dark = useSyncExternalStore(subscribeTheme, readTheme, () => false);
  const changeTheme = () => { localStorage.setItem("restaurant-admin-theme", dark ? "light" : "dark"); window.dispatchEvent(new Event("restaurant-admin-theme-change")); };
  useEffect(() => {
    const toggleSidebar = () => setCollapsed((value) => !value);
    window.addEventListener("restaurant-admin-sidebar-toggle", toggleSidebar);
    return () => window.removeEventListener("restaurant-admin-sidebar-toggle", toggleSidebar);
  }, []);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("restaurant-admin-sidebar-state", { detail: collapsed }));
  }, [collapsed]);
  const section = [...primary, ...secondary].find((item) => item.href === pathname)?.label ?? "Управление";
  const active = (href: string) => href === "/admin" ? pathname === href : pathname.startsWith(href);
  const visiblePrimary = actor.role === "owner" ? primary : primary.filter((item) => item.href === "/admin" || item.href === "/admin/bookings");
  const visibleSecondary = actor.role === "owner" ? secondary : [];
  const initials = actor.name.trim().split(/\s+/).slice(0, 2).map((part) => part.slice(0, 1).toLocaleUpperCase("ru-RU")).join("") || "А";

  return <div className={`${styles.shell} ${dark ? styles.dark : ""} ${collapsed ? styles.collapsed : ""}`}>
    <aside className={styles.sidebar} aria-label="Панель ресторана">
      <Link href="/admin" className={styles.brand} aria-label={`${restaurantName}: заказы`}>
        <span className={styles.logo}>{logo && !logoFailed ? <Image src={logo} width={52} height={52} alt="" unoptimized onError={() => setLogoFailed(true)}/> : restaurantName.slice(0, 1)}</span>
        <span className={styles.brandText}><strong>{restaurantName}</strong><small>Панель ресторана</small></span>
      </Link>
      <button type="button" className={styles.collapseButton} aria-label={collapsed ? "Развернуть боковую панель" : "Свернуть боковую панель"} aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}><AdminIcon name={collapsed ? "chevron" : "collapse"}/></button>
      <nav className={styles.primaryNav} aria-label="Главная навигация">
        {visiblePrimary.map((item) => <Link key={item.href} href={item.href} className={`${styles.navLink} ${active(item.href) ? styles.current : ""}`} aria-label={item.label} aria-current={active(item.href) ? "page" : undefined} title={collapsed ? item.label : undefined}><AdminIcon name={item.icon} size={22}/><span>{item.label}</span>{item.href === "/admin" && newOrdersCount > 0 && <em>{newOrdersCount}</em>}{item.href === "/admin/bookings" && newBookingsCount > 0 && <em>{newBookingsCount}</em>}</Link>)}
      </nav>
      <div className={styles.sidebarFoot}><span aria-hidden="true">✳</span><div>Хорошего дня!<small>Вкусная еда собирает людей</small></div></div>
    </aside>
    <div className={styles.workspace}>
      <header className={styles.topbar}>
        <div className={styles.breadcrumb}>Панель администратора <span>/</span> <strong>{section}</strong></div>
        <div className={styles.topActions}>
          <AdminNotifications/>
          <button type="button" className={`${styles.themeButton} ${dark ? styles.themeDark : ""}`} onClick={changeTheme} aria-label={dark ? "Включить светлую тему" : "Включить тёмную тему"} aria-pressed={dark}><span className={styles.themeThumb}><AdminIcon name={dark ? "moon" : "sun"} size={19}/></span><span>{dark ? "Тёмная" : "Светлая"}</span></button>
          <div className={styles.profileWrap}>
            <button type="button" className={styles.profileButton} onClick={() => setProfileOpen((value) => !value)} aria-expanded={profileOpen} aria-label={`Профиль: ${actor.name}`}><span className={styles.avatar}>{initials}</span><span className={styles.profileText}><strong>{actor.name}</strong><small>{actor.role === "owner" ? "Владелец" : "Сотрудник"}</small></span><AdminIcon name="chevron" size={16}/></button>
            {profileOpen && <div className={styles.profilePopover}><strong>{actor.name}</strong><small>{actor.role === "owner" ? "Владелец" : "Сотрудник"}</small>{visibleSecondary.length > 0 && <nav aria-label="Другие разделы">{visibleSecondary.map((item) => <Link key={item.href} href={item.href} onClick={() => setProfileOpen(false)}>{item.label}</Link>)}</nav>}<Link href="/" onClick={() => setProfileOpen(false)}>Открыть сайт ↗</Link><form action={logoutAction}><button type="submit">Выйти</button></form></div>}
          </div>
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
    <nav className={styles.bottomNav} aria-label="Мобильная навигация">{visiblePrimary.map((item) => <Link key={item.href} href={item.href} className={active(item.href) ? styles.current : ""} aria-current={active(item.href) ? "page" : undefined}><AdminIcon name={item.icon}/><span>{item.label}</span>{item.href === "/admin" && newOrdersCount > 0 && <em aria-label={`Новых заказов: ${newOrdersCount}`}>{newOrdersCount}</em>}{item.href === "/admin/bookings" && newBookingsCount > 0 && <em aria-label={`Новых броней: ${newBookingsCount}`}>{newBookingsCount}</em>}</Link>)}</nav>
  </div>;
}
