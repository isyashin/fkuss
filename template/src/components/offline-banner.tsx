"use client";

import { useSyncExternalStore } from "react";

function subscribeOnline(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/** Без сети — понятная плашка. Устаревшее меню не показываем (кэша нет). */
export function OfflineBanner() {
  const offline = useSyncExternalStore(
    subscribeOnline,
    () => !navigator.onLine,
    () => false,
  );

  if (!offline) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-50 bg-foreground text-background text-center text-sm py-2 px-4">
      Нет подключения к сети. Проверьте интернет и обновите страницу.
    </div>
  );
}
