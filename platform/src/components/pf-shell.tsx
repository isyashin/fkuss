"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { logoutPlatformAdminAction, logoutOwnerAction } from "@/lib/logout-actions";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("pf-theme-change", callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener("pf-theme-change", callback); };
}
const readTheme = () => {
  try { return localStorage.getItem("pf-theme") === "dark"; } catch { return false; }
};

const NAV_ICONS: Record<string, string> = { sites: "◼", cabinet: "◼" };

/** Обёртка для публичных экранов (вход): токены + переключатель темы без сайдбара. */
export function PfLoginShell({ eyebrow, title, lead, children }: {
  eyebrow: string; title: string; lead: string; children: ReactNode;
}) {
  const dark = useSyncExternalStore(subscribe, readTheme, () => false);
  const toggleTheme = () => {
    try { localStorage.setItem("pf-theme", dark ? "light" : "dark"); } catch { /* ignore */ }
    window.dispatchEvent(new Event("pf-theme-change"));
  };
  return (
    <div className={`pf-app ${dark ? "pf-dark" : ""}`} style={{ display: "block" }}>
      <button type="button" className="pf-theme" onClick={toggleTheme} aria-label={dark ? "Включить светлую тему" : "Включить тёмную тему"}
        style={{ position: "fixed", top: 14, right: 14, zIndex: 30 }}>
        <span className="pf-themeThumb" aria-hidden="true">{dark ? "☾" : "☀"}</span>
        <span>{dark ? "Тёмная" : "Светлая"}</span>
      </button>
      <div className="pf-loginPage">
        <div className="pf-loginCard">
          <span className="pf-eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{lead}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

export function PfShell({ variant, nav, crumb, userName, userRole, children }: {
  variant: "admin" | "cabinet";
  nav: { href: string; label: string }[];
  crumb: string;
  userName: string;
  userRole: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const dark = useSyncExternalStore(subscribe, readTheme, () => false);
  const [profileOpen, setProfileOpen] = useState(false);

  const toggleTheme = () => {
    try { localStorage.setItem("pf-theme", dark ? "light" : "dark"); } catch { /* ignore */ }
    window.dispatchEvent(new Event("pf-theme-change"));
  };

  const isActive = (href: string) => (href === "/admin" || href === "/cabinet" ? pathname === href : pathname.startsWith(href));
  const initials = userName.trim().split(/\s+/).slice(0, 2).map((part) => part.slice(0, 1).toLocaleUpperCase("ru-RU")).join("") || "П";

  return (
    <div className={`pf-app ${dark ? "pf-dark" : ""}`}>
      <aside className="pf-sidebar">
        <Link href={nav[0]?.href ?? "/"} className="pf-brand" aria-label="Fkuss — платформа">
          <span className="pf-brandLogo">F</span>
          <span><strong>Fkuss</strong><small>{variant === "admin" ? "Платформа сайтов" : "Кабинет владельца"}</small></span>
        </Link>
        <nav className="pf-nav" aria-label="Навигация">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} data-active={isActive(item.href)}>
              <span aria-hidden="true">{NAV_ICONS.sites}</span>{item.label}
            </Link>
          ))}
        </nav>
        <div className="pf-sideFoot">Fkuss — сайты ресторанов<br />под ключ по подписке</div>
      </aside>

      <div className="pf-workspace">
        <header className="pf-topbar">
          <div className="pf-crumb"><span>Fkuss / </span><strong>{crumb}</strong></div>
          <div className="pf-topActions">
            <button type="button" className="pf-theme" onClick={toggleTheme} aria-label={dark ? "Включить светлую тему" : "Включить тёмную тему"} aria-pressed={dark}>
              <span className="pf-themeThumb" aria-hidden="true">{dark ? "☾" : "☀"}</span>
              <span>{dark ? "Тёмная" : "Светлая"}</span>
            </button>
            <div className="pf-profile">
              <button type="button" className="pf-profileButton" onClick={() => setProfileOpen((v) => !v)} aria-expanded={profileOpen} aria-label={`Профиль: ${userName}`}>
                <span className="pf-avatar">{initials}</span>
                <span className="hidden sm:block"><strong style={{ fontSize: 12 }}>{userName}</strong><br /><small className="pf-muted">{userRole}</small></span>
              </button>
              {profileOpen && (
                <div className="pf-popover">
                  <strong>{userName}</strong>
                  <small className="pf-muted">{userRole}</small>
                  <form action={variant === "admin" ? logoutPlatformAdminAction : logoutOwnerAction}>
                    <button type="submit" className="pf-link">Выйти</button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="pf-main">{children}</main>
      </div>
    </div>
  );
}
