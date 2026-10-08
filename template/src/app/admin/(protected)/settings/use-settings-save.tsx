"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { saveSettings } from "./actions";
import { isSettingsConflict } from "@/lib/admin-settings-version";
import type { ContentSettings } from "@/lib/content-schema";
import rd from "../admin-redesign.module.css";

/* Хранилище текущей версии настроек: страница (серверная) передаёт _rev,
   редакторы читают его в момент сохранения — без prop-drilling. */
let currentRev: number | null = null;

export function setSettingsRev(rev: number | null) {
  currentRev = rev;
}

export function getSettingsRev(): number | null {
  return currentRev;
}

/** Серверная страница настроек кладёт актуальную версию сюда (обновляется при refresh). */
export function SettingsRevProvider({ rev, children }: { rev: number; children: ReactNode }) {
  useEffect(() => { setSettingsRev(rev); }, [rev]);
  return <>{children}</>;
}

/** Сохранение секции с обнаружением конфликта вкладок (F04).
    Возвращает элемент диалога — его нужно отрендерить в дереве редактора. */
export function useSettingsSave() {
  const router = useRouter();
  const [conflict, setConflict] = useState(false);
  const lastNextRef = useRef<ContentSettings | null>(null);

  /** Сохраняет настройки. При конфликте показывает диалог, повторный вызов
      с force=true — явная перезапись. */
  async function save(next: ContentSettings, force = false): Promise<"ok" | "conflict" | "error"> {
    lastNextRef.current = next;
    try {
      await saveSettings(next, getSettingsRev(), force);
      setConflict(false);
      return "ok";
    } catch (error) {
      if (isSettingsConflict(error)) {
        setConflict(true);
        return "conflict";
      }
      return "error";
    }
  }

  const control = conflict ? (
    <SettingsConflictDialog
      onRefresh={() => { setConflict(false); router.refresh(); }}
      onOverwrite={() => {
        const next = lastNextRef.current;
        setConflict(false);
        if (next) save(next, true).then((result) => { if (result === "ok") router.refresh(); });
      }}
      onClose={() => setConflict(false)}
    />
  ) : null;

  return { save, control };
}

function SettingsConflictDialog({ onRefresh, onOverwrite, onClose }: {
  onRefresh: () => void;
  onOverwrite: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog ref={ref} className={rd.dialog} onClose={onClose} onClick={(event) => { if (event.target === ref.current) onClose(); }}>
      <div className={rd.dialogBody}>
        <h2 className={rd.dialogTitle}>Настройки изменены в другой вкладке</h2>
        <p className={rd.dialogText}>
          Параллельная правка сохранила более новую версию. Обновите данные и примените свои правки повторно — или перезапишите чужие своими.
        </p>
        <div className={rd.dialogActions}>
          <button type="button" className={rd.btn} onClick={onClose}>Отмена</button>
          <button type="button" className={rd.btn} onClick={onRefresh} autoFocus>Обновить</button>
          <button type="button" className={`${rd.btn} ${rd.btnPrimary}`} onClick={onOverwrite}>Перезаписать</button>
        </div>
      </div>
    </dialog>
  );
}
