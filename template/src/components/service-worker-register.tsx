"use client";

import { useEffect } from "react";

/** Регистрация service worker витрины (#52): статика и страницы из кэша, офлайн-заглушка. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);
  return null;
}
