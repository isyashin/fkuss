"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { logoutAction } from "./admin-shell-actions";
import type { AdminActor } from "@/lib/admin-users";
import { AdminNotifications } from "./admin-notifications";
import styles from "./admin-ui.module.css";

const primary = [
  { href: "/admin", label: "Заказы", icon: "orders" },
  { href: "/admin/bookings", label: "Брони", icon: "bookings" },
  { href: "/admin/menu", label: "Меню", icon: "menu" },
  { href: "/admin/settings", label: "Настройки", icon: "settings" },
] as const;

const secondary = [
  { href: "/admin/promos", label: "Акции" },
  { href: "/admin/gallery", label: "Галерея" },
  { href: "/admin/banquets", label: "Банкеты" },
  { href: "/admin/pages", label: "Страницы" },
  { href: "/admin/restaurant", label: "Ресторан" },
  { href: "/admin/sync", label: "Синхронизация" },
  { href: "/admin/delivery", label: "Доставка" },
  { href: "/admin/print-materials", label: "Печать" },
  { href: "/admin/billing", label: "Подписка" },
  { href: "/admin/team", label: "Сотрудники" },
] as const;

function subscribeTheme(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("restaurant-admin-theme-change", callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener("restaurant-admin-theme-change", callback); };
}
const readTheme = () => localStorage.getItem("restaurant-admin-theme") === "dark";

function NavIcon({ kind }: { kind: string }) {
  const common = { width: 21, height: 21, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  if (kind === "orders") return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h10M7 17h6"/></svg>;
  if (kind === "bookings") return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 15h3"/></svg>;
  if (kind === "menu") return <svg {...common}><path d="M4 3v7a3 3 0 0 0 6 0V3M7 3v18M17 21V3c-3 2-4 5-4 10h4"/></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.2-1.6l1.7-1.3-1.8-3.1-2 .8a7 7 0 0 0-2.7-1.6L13.7 3h-3.4L10 5.2a7 7 0 0 0-2.7 1.6l-2-.8-1.8 3.1 1.7 1.3a7 7 0 0 0 0 3.2l-1.7 1.3 1.8 3.1 2-.8a7 7 0 0 0 2.7 1.6l.3 2.2h3.4l.3-2.2a7 7 0 0 0 2.7-1.6l2 .8 1.8-3.1-1.7-1.3A7 7 0 0 0 19 12Z"/></svg>;
}

export function AdminShell({ children, restaurantName, logo, actor }: { children: ReactNode; restaurantName: string; logo: string; actor: AdminActor }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const dark = useSyncExternalStore(subscribeTheme, readTheme, () => false);
  const changeTheme = () => { localStorage.setItem("restaurant-admin-theme", dark ? "light" : "dark"); window.dispatchEvent(new Event("restaurant-admin-theme-change")); };
  const section = [...primary, ...secondary].find((item) => item.href === pathname)?.label ?? "Управление";
  const active = (href: string) => href === "/admin" ? pathname === href : pathname.startsWith(href);
  const visiblePrimary = actor.role === "owner" ? primary : primary.filter((item) => item.href === "/admin" || item.href === "/admin/bookings");
  const visibleSecondary = actor.role === "owner" ? secondary : [];

  return <div className={`${styles.shell} ${dark ? styles.dark : ""} ${collapsed ? styles.collapsed : ""}`}>
    <aside className={styles.sidebar} aria-label="Панель ресторана">
      <Link href="/admin" className={styles.brand} aria-label={`${restaurantName}: заказы`}>
        <span className={styles.logo}>{logo ? <Image src={logo} width={50} height={50} alt="" unoptimized/> : restaurantName.slice(0, 1)}</span>
        <span className={styles.brandText}><strong>{restaurantName}</strong><small>Панель ресторана</small></span>
      </Link>
      <button type="button" className={styles.collapseButton} aria-label={collapsed ? "Развернуть боковую панель" : "Свернуть боковую панель"} aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}>{collapsed ? "›" : "‹"}</button>
      <nav className={styles.primaryNav} aria-label="Главная навигация">
        {visiblePrimary.map((item) => <Link key={item.href} href={item.href} className={`${styles.navLink} ${active(item.href) ? styles.current : ""}`} aria-label={item.label} aria-current={active(item.href) ? "page" : undefined}><NavIcon kind={item.icon}/><span>{item.label}</span></Link>)}
      </nav>
      {visibleSecondary.length > 0 && <><div className={styles.secondaryTitle}>Разделы</div>
      <nav className={styles.secondaryNav} aria-label="Остальные разделы">
        {visibleSecondary.map((item) => <Link key={item.href} href={item.href} className={`${styles.secondaryLink} ${active(item.href) ? styles.current : ""}`} aria-current={active(item.href) ? "page" : undefined}>{item.label}</Link>)}
      </nav></>}
      <Link href="/" className={styles.siteLink}>Открыть сайт ↗</Link>
    </aside>
    <div className={styles.workspace}>
      <header className={styles.topbar}>
        <div className={styles.breadcrumb}>Панель <span>›</span> <strong>{section}</strong></div>
        {visibleSecondary.length > 0 && <details className={styles.mobileMore}><summary>Все разделы</summary><nav aria-label="Остальные разделы">{visibleSecondary.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}<Link href="/">Открыть сайт ↗</Link></nav></details>}
        <div className={styles.topActions}>
          <AdminNotifications/>
          <span className={styles.actorName}>{actor.name}</span>
          <button type="button" className={styles.themeButton} onClick={changeTheme} aria-label={dark ? "Включить светлую тему" : "Включить тёмную тему"}>{dark ? "☀" : "☾"}<span>{dark ? "Тёмная" : "Светлая"}</span></button>
          <form action={logoutAction}><button type="submit" className={styles.logoutButton}>Выйти</button></form>
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
    <nav className={styles.bottomNav} aria-label="Мобильная навигация">{visiblePrimary.map((item) => <Link key={item.href} href={item.href} className={active(item.href) ? styles.current : ""} aria-current={active(item.href) ? "page" : undefined}><NavIcon kind={item.icon}/><span>{item.label}</span></Link>)}</nav>
  </div>;
}
