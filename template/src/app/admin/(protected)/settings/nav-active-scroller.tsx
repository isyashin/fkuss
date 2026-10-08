"use client";

import { useEffect } from "react";

/** D01: при прямом входе (?section=…) активный пункт навигации должен быть
    видим — прокручиваем именно контейнер навигации до него. */
export function NavActiveScroller({ active }: { active: string }) {
  useEffect(() => {
    const nav = document.querySelector('nav[aria-label="Разделы настроек"]');
    const current = nav?.querySelector('[aria-current="page"]');
    current?.scrollIntoView({ block: "nearest" });
  }, [active]);
  return null;
}
