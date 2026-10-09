"use client";

import { useEffect } from "react";

/** D01/F15: при прямом входе (?section=…) активный пункт навигации должен быть
    виден — прокручиваем именно контейнер навигации до него. */
export function NavActiveScroller({ active }: { active: string }) {
  useEffect(() => {
    const nav = document.querySelector('nav[aria-label="Разделы настроек"]');
    if (!nav) return;
    const current = nav.querySelector('[aria-current="page"]');
    if (!current) return;
    // Явная математика вместо scrollIntoView: контейнер с overflow пересчитываем сами.
    const target = (current as HTMLElement).offsetTop - nav.clientHeight / 2 + (current as HTMLElement).offsetHeight / 2;
    nav.scrollTop = Math.max(0, target);
  }, [active]);
  return null;
}
