"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Кнопка «Установить приложение».
 * Android/Chrome — системный диалог (beforeinstallprompt).
 * iOS Safari — инструкция «Поделиться → На экран Домой» (программно нельзя).
 * На админских страницах не показывается.
 */
export function InstallPrompt() {
  const pathname = usePathname();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("install-prompt-hidden") === "1") {
      setHidden(true);
      return;
    }
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));
    setIsStandalone(window.matchMedia("(display-mode: standalone)").matches);
    const handler = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (pathname.startsWith("/admin") || hidden || isStandalone || (!deferred && !isIOS)) return null;

  function dismiss() {
    localStorage.setItem("install-prompt-hidden", "1");
    setHidden(true);
  }

  return (
    <>
      <div className="fixed bottom-20 inset-x-0 z-30 px-4 flex justify-center pointer-events-none">
        <div className="pointer-events-auto bg-foreground text-background rounded-full shadow-lg flex items-center gap-2 pl-5 pr-2 py-2">
          <button
            onClick={async () => {
              if (deferred) {
                await deferred.prompt();
                const choice = await deferred.userChoice;
                if (choice.outcome === "accepted") dismiss();
                setDeferred(null);
              } else if (isIOS) {
                setShowIosHelp(true);
              }
            }}
            className="min-h-11 font-medium"
          >
            Установить приложение
          </button>
          <button onClick={dismiss} className="min-w-11 min-h-11 opacity-70" aria-label="Скрыть">
            ×
          </button>
        </div>
      </div>

      {showIosHelp && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal>
          <button className="absolute inset-0 bg-black/50" onClick={() => setShowIosHelp(false)} aria-label="Закрыть" />
          <div className="relative bg-background w-full sm:max-w-md rounded-t-2xl p-6">
            <h3 className="text-xl mb-3">Установка на iPhone</h3>
            <ol className="space-y-3 text-muted">
              <li>1. Нажмите кнопку «Поделиться» в Safari (квадрат со стрелкой вверх).</li>
              <li>2. Прокрутите вниз и выберите «На экран “Домой”».</li>
              <li>3. Нажмите «Добавить» — иконка ресторана появится на рабочем столе.</li>
            </ol>
            <button
              onClick={() => setShowIosHelp(false)}
              className="mt-5 w-full min-h-12 rounded-full bg-accent text-white font-medium"
            >
              Понятно
            </button>
          </div>
        </div>
      )}
    </>
  );
}
