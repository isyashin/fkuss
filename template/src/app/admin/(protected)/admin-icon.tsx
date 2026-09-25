import type { ReactNode } from "react";

export function AdminIcon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    orders: <><circle cx="10.5" cy="4" r="1.5"/><rect x="1.5" y="9" width="4" height="4" rx=".5"/><path d="M5.5 11h2l1.2-3c.4-.9 1.7-1.1 2.4-.4l2.6 2.5 2.4.5m-7.4 1.2 3.5 1.2 3.2M3.5 16.5h12.2l1.5-5h1.7m-1.4 1 1.5 4"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/></>,
    bookings: <><circle cx="5" cy="5" r="1.5"/><circle cx="19" cy="5" r="1.5"/><path d="M5 8v5l3 2h2m9-7v5l-3 2h-2M3 11v6h5v3m13-9v6h-5v3M9.5 12h5M12 12v8"/></>,
    menu: <><path d="M4 3v7a3 3 0 0 0 6 0V3M7 3v18M17 21V3c-3 2-4 5-4 10h4"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 1.1 1.9-2.1 2.1-1.9-1.1a8 8 0 0 1-2 .8l-.6 2.2h-3l-.6-2.2a8 8 0 0 1-2-.8l-1.9 1.1-2.1-2.1L5.4 15a8 8 0 0 1-.8-2L2.4 12l2.2-1a8 8 0 0 1 .8-2L4.3 7.1 6.4 5l1.9 1.1a8 8 0 0 1 2-.8L10.9 3h3l.6 2.3a8 8 0 0 1 2 .8L18.4 5l2.1 2.1L19.4 9a8 8 0 0 1 .8 2l2.2 1-2.2 1a8 8 0 0 1-.8 2Z"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    collapse: <path d="m15 6-6 6 6 6"/>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
    moon: <path d="M20 15.5A8 8 0 0 1 8.5 4 8 8 0 1 0 20 15.5Z"/>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9ZM10 21h4"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    minus: <path d="M5 12h14"/>,
    close: <path d="M5 5l14 14M19 5 5 19"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.chevron}</svg>;
}
