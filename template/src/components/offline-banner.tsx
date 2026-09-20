"use client";

import { useEffect, useState } from "react";

/** Без сети — понятная плашка. Устаревшее меню не показываем (кэша нет). */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    setOffline(!navigator.onLine);
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="fixed inset-x-0 top-0 z-50 bg-foreground text-background text-center text-sm py-2 px-4">
      Нет подключения к сети. Проверьте интернет и обновите страницу.
    </div>
  );
}
