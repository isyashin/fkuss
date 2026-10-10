"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { saveSettings } from "./actions";
import { isSettingsConflict } from "@/lib/admin-settings-version";
import type { ContentSettings } from "@/lib/content-schema";
import rd from "../admin-redesign.module.css";

/* Хранилище текущей версии настроек: страница (серверная) передаёт _rev.
   Важно: версия для сохранения фиксируется при загрузке страницы и НЕ
   обновляется фоновым опросом (иначе устаревшая вкладка получает свежий rev
   и конфликт перестаёт обнаруживаться — F04). Свежая версия принимается
   явно — кнопкой «Обновить» в диалоге конфликта. */
let savedRev: number | null = null;
let latestRev: number | null = null;
// Эпоха явного обновления: «Обновить» ждёт свежих props (rev изменился),
// затем бампит эпоху — редакторы сбрасывают локальные черновики к свежим
// данным, и пользователь заново применяет только свою правку (P1-2).
let refreshEpoch = 0;
let awaitingRefresh = false;
const epochListeners = new Set<() => void>();

function bumpEpoch() {
  refreshEpoch += 1;
  epochListeners.forEach((listener) => listener());
}

function subscribeEpoch(listener: () => void) {
  epochListeners.add(listener);
  return () => { epochListeners.delete(listener); };
}

/** Эпоха обновления настроек: меняется после «Обновить» в диалоге конфликта. */
export function useSettingsEpoch(): number {
  return useSyncExternalStore(subscribeEpoch, () => refreshEpoch);
}

/** Сбрасывает локальное состояние редактора к свежим props после «Обновить». */
export function useResetSettingsOnEpoch(epoch: number, reset: () => void) {
  const resetRef = useRef(reset);
  useEffect(() => { resetRef.current = reset; }, [reset]);
  useEffect(() => {
    if (epoch > 0) resetRef.current();
  }, [epoch]);
}

export function setSettingsRev(rev: number | null) {
  savedRev = rev;
}

export function getSettingsRev(): number | null {
  return savedRev;
}

/** Серверная страница настроек кладёт актуальную версию сюда (обновляется при refresh).
    Если вкладка нажала «Обновить» и свежие данные приехали — принимаем версию
    и оповещаем редакторы о сбросе черновиков. */
export function SettingsRevProvider({ rev, children }: { rev: number; children: ReactNode }) {
  useEffect(() => {
    latestRev = rev;
    if (savedRev === null) {
      setSettingsRev(rev);
      return;
    }
    if (awaitingRefresh && rev !== savedRev) {
      savedRev = rev;
      awaitingRefresh = false;
      bumpEpoch();
    }
  }, [rev]);
  return <>{children}</>;
}

/** Сохранение секции с обнаружением конфликта вкладок (F04).
    Возвращает элемент диалога — его нужно отрендерить в дереве редактора.
    saveFn: по умолчанию saveSettings; можно передать другой версионируемый
    action с любым входом (например, savePricing для правил цен). */
export function useSettingsSave<TInput = ContentSettings>(
  saveFn?: (input: TInput, expectedRev?: number | null, force?: boolean) => Promise<"ok" | "conflict">,
) {
  const router = useRouter();
  const [conflict, setConflict] = useState(false);
  const lastNextRef = useRef<TInput | null>(null);
  const actionRef = useRef(saveFn ?? (saveSettings as unknown as (input: TInput, expectedRev?: number | null, force?: boolean) => Promise<"ok" | "conflict">));

  /** Сохраняет настройки. При конфликте показывает диалог, повторный вызов
      с force=true — явная перезапись. */
  async function save(next: TInput, force = false): Promise<"ok" | "conflict" | "error"> {
    lastNextRef.current = next;
    try {
      const result = await actionRef.current(next, getSettingsRev(), force);
      if (result === "conflict") {
        setConflict(true);
        return "conflict";
      }
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
      onRefresh={() => {
        setConflict(false);
        // Ждём свежие props: провайдер примет новую версию и бампнет эпоху,
        // редакторы сбросят черновики к свежим данным (P1-2).
        awaitingRefresh = true;
        router.refresh();
      }}
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
