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
// «Обновить» со свежими props на странице: сброс редакторов уже выполнен
// немедленным бампом — провайдер примет ту же ревизию без повторного сброса
// (иначе поздний бамп стёр бы правку, введённую после «Обновить»). Ревизия,
// к которой выполнен сброс: если придёт ЕЁ БОЛЕЕ СВЕЖАЯ — это поздняя чужая
// правка, редакторы сбрасываем повторно (аудит 12.10).
let acceptRevWithoutBump = false;
let silentAcceptBaseline: number | null = null;
const epochListeners = new Set<() => void>();

function bumpEpoch() {
  refreshEpoch += 1;
  epochListeners.forEach((listener) => listener());
}

function subscribeEpoch(listener: () => void) {
  epochListeners.add(listener);
  return () => { epochListeners.delete(listener); };
}

/** Эпоха обновления настроек: меняется после «Обновить» в диалоге конфликта.
    getServerSnapshot обязателен: без него SSR страницы падает (500) и
    router.refresh() перестаёт доставлять свежие props (P1-2). */
export function useSettingsEpoch(): number {
  return useSyncExternalStore(subscribeEpoch, () => refreshEpoch, () => 0);
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

/** Вкладка принимает ревизию собственной записи (автосохранения каналов,
    банкетов, кабинета), которая не проходила через useSettingsSave — иначе
    её следующее версионированное сохранение ложно конфликтует (аудит 12.10). */
export function acceptSettingsRev(rev: number): void {
  savedRev = Math.max(savedRev ?? 0, rev);
  latestRev = Math.max(latestRev ?? 0, rev);
}

/** Серверная страница настроек кладёт актуальную версию сюда (обновляется при refresh).
    Если вкладка нажала «Обновить» и refresh привёз ещё более свежую версию —
    принимаем её и добампливаем эпоху (редакторы сбросятся повторно). */
export function SettingsRevProvider({ rev, children }: { rev: number; children: ReactNode }) {
  useEffect(() => {
    latestRev = rev;
    if (savedRev === null) {
      setSettingsRev(rev);
      return;
    }
    const acceptSilently = acceptRevWithoutBump;
    acceptRevWithoutBump = false;
    if (rev === savedRev) { silentAcceptBaseline = null; return; }
    if (acceptSilently) {
      // Сброс после «Обновить» уже выполнен к silentAcceptBaseline. Та же
      // ревизия — принимаем молча; более свежая — поздняя чужая правка:
      // редакторы обязаны сброситься к ней.
      const baseline = silentAcceptBaseline ?? savedRev ?? 0;
      silentAcceptBaseline = null;
      savedRev = rev;
      if (rev > baseline) bumpEpoch();
      return;
    }
    if (awaitingRefresh) {
      // Props отставали от сервера: refresh доставил свежий rev — единственный
      // сброс редакторов к свежим данным выполняем здесь.
      savedRev = rev;
      awaitingRefresh = false;
      bumpEpoch();
    }
  }, [rev]);
  return <>{children}</>;
}

/** Сохранение секции с обнаружением конфликта вкладок (F04).
    Возвращает элемент диалога — его нужно отрендерить в дереве редактора.
    errorMessage — текст последней непредвиденной ошибки (иначе null).
    saveFn: по умолчанию saveSettings; можно передать другой версионируемый
    action с любым входом (например, savePricing для правил цен).
    Action возвращает новую серверную ревизию — хук принимает её, чтобы
    следующее сохранение этой же вкладки не конфликтовало ложно (P1, аудит 11.10). */
export function useSettingsSave<TInput = ContentSettings>(
  saveFn?: (input: TInput, expectedRev?: number | null, force?: boolean) => Promise<number | "conflict">,
) {
  const router = useRouter();
  const [conflict, setConflict] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const lastNextRef = useRef<TInput | null>(null);
  const actionRef = useRef(saveFn ?? (saveSettings as unknown as (input: TInput, expectedRev?: number | null, force?: boolean) => Promise<number | "conflict">));

  /** Сохраняет настройки. При конфликте показывает диалог, повторный вызов
      с force=true — явная перезапись. После успеха принимает новую ревизию
      и обновляет props (router.refresh), чтобы переключение разделов не
      подхватывало устаревший закэшированный фрагмент с полным объектом. */
  async function save(next: TInput, force = false): Promise<"ok" | "conflict" | "error"> {
    lastNextRef.current = next;
    setErrorMessage(null);
    try {
      const result = await actionRef.current(next, getSettingsRev(), force);
      if (result === "conflict") {
        setConflict(true);
        return "conflict";
      }
      savedRev = result;
      setConflict(false);
      router.refresh();
      return "ok";
    } catch (error) {
      if (isSettingsConflict(error)) {
        setConflict(true);
        return "conflict";
      }
      setErrorMessage(error instanceof Error ? error.message : null);
      return "error";
    }
  }

  const control = conflict ? (
    <SettingsConflictDialog
      onRefresh={() => {
        setConflict(false);
        // «Обновить» принимает самую свежую известную версию и сбрасывает
        // редакторы. Не опускаем savedRev ниже собственной ревизии: latestRev
        // из props может отставать. Два случая:
        // — опрос уже привёз свежий rev: props на странице актуальны — бампим
        //   эпоху немедленно, а провайдер лишь примет rev, если refresh
        //   привезёт ещё свежее (без повторного сброса — он стёр бы правку,
        //   введённую после «Обновить»);
        // — props отстают: сброс делает провайдер, когда router.refresh()
        //   доставит свежий rev (P1-2, гонка двойного сброса 11.10).
        const knownFresh = (latestRev ?? 0) > (savedRev ?? 0);
        savedRev = Math.max(savedRev ?? 0, latestRev ?? 0);
        if (knownFresh) {
          acceptRevWithoutBump = true;
          silentAcceptBaseline = savedRev;
          bumpEpoch();
        } else {
          awaitingRefresh = true;
        }
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

  return { save, control, errorMessage };
}

export function SettingsConflictDialog({ onRefresh, onOverwrite, onClose }: {
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
