"use client";

import { useState, useTransition } from "react";
import { saveSyncSettings, runSyncNow } from "./actions";
import type { ContentSettings } from "@/lib/content-schema";
import { formatAdminDate } from "@/lib/admin-date";
import { isSyncLockStale } from "@/lib/yandex-eda/sync-lock";
import styles from "./sync-admin.module.css";

export function SyncAdmin({
  settings,
  syncState,
  menus,
}: {
  settings: ContentSettings;
  syncState: Record<string, unknown>;
  menus: { id: string; name: string }[];
}) {
  const [sync, setSync] = useState(settings.sync);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string>("");
  const [saved, setSaved] = useState(false);

  const inputCls = "mt-1 w-full min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15";
  const sources = sync.sources ?? [];
  const setSources = (next: typeof sources) => setSync({ ...sync, sources: next });
  const lastError = typeof syncState.lastError === "string" ? syncState.lastError : null;
  const lastSuccess = typeof syncState.lastSuccess === "string" ? syncState.lastSuccess : null;
  const lastAttempt = typeof syncState.lastAttempt === "string" ? syncState.lastAttempt : null;
  const runningRaw = syncState.running === true;
  // F05: блокировку, которую не отпустил упавший процесс, считаем зависшей —
  // показываем состояние «прервано» и снова разрешаем ручной запуск.
  const stuck = runningRaw && isSyncLockStale(syncState, new Date());
  const running = runningRaw && !stuck;
  // Единый формат дат на сервере и в браузере, в часовом поясе ресторана.
  const timeZone = (settings as { timezone?: string }).timezone ?? "Europe/Moscow";
  const attemptText = lastAttempt ? formatAdminDate(new Date(lastAttempt), timeZone) : "—";
  const successText = lastSuccess ? formatAdminDate(new Date(lastSuccess), timeZone) : "—";

  return (
    <div className={styles.form}>
        <label className="flex items-center gap-3 min-h-11">
          <input
            type="checkbox"
            checked={sync.enabled}
            onChange={(e) => setSync({ ...sync, enabled: e.target.checked })}
            className="w-5 h-5 accent-[var(--accent)]"
          />
          Автоматическая синхронизация по расписанию
        </label>

        <div className={styles.fields}>
        <div className="block w-full">
          <span className="text-sm text-muted">Источники меню (места Яндекс.Еды)</span>
          {sources.length === 0 && (
            <p className="text-sm text-muted mt-1">Источники не заданы — синхронизация не запустится.</p>
          )}
          {sources.map((source, index) => (
            <div key={index} className="flex items-center gap-2 mt-2">
              <input
                value={source.placeSlug}
                onChange={(e) => setSources(sources.map((s, i) => (i === index ? { ...s, placeSlug: e.target.value } : s)))}
                placeholder="batono_w98td"
                aria-label={`placeSlug источника ${index + 1}`}
                className="flex-1 min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15"
              />
              <select
                value={source.menuId ?? ""}
                onChange={(e) => setSources(sources.map((s, i) => (i === index ? { ...s, menuId: e.target.value } : s)))}
                aria-label={`Меню источника ${index + 1}`}
                className="min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15"
              >
                <option value="">Без меню</option>
                {menus.map((menu) => <option key={menu.id} value={menu.id}>{menu.name}</option>)}
              </select>
              <button
                type="button"
                disabled={pending}
                onClick={() => setSources(sources.filter((_, i) => i !== index))}
                className="min-h-11 px-3 rounded-[var(--radius)] border border-foreground/15"
                aria-label={`Удалить источник ${index + 1}`}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            disabled={pending}
            onClick={() => setSources([...sources, { placeSlug: "", menuId: "" }])}
            className="mt-2 min-h-11 px-4 rounded-[var(--radius)] border border-foreground/15 text-sm"
          >
            + Добавить источник
          </button>
          {sources.length === 0 && sync.placeSlug && (
            <p className="text-sm text-muted mt-1">Легаси placeSlug: {sync.placeSlug} (будет использован, пока нет источников).</p>
          )}
        </div>

        <label className="block">
          <span className="text-sm text-muted">Периодичность (минут)</span>
          <input
            type="number"
            min={5}
            max={1440}
            value={sync.intervalMinutes}
            onChange={(e) => setSync({ ...sync, intervalMinutes: Number(e.target.value) })}
            className={inputCls}
          />
        </label>
        </div>

        <div className={styles.actions}>
        <button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await saveSyncSettings(sync);
              setSaved(true);
              setTimeout(() => setSaved(false), 3000);
            })
          }
          className={styles.save}
        >
          Сохранить
        </button>
        <button
          disabled={pending || running}
          onClick={() =>
            startTransition(async () => {
              setResult("");
              const r = await runSyncNow();
              setResult(
                r.ok
                  ? `✓ Синхронизировано: обновлено ${r.upserted ?? 0}, скрыто пропавших ${r.missing ?? 0}`
                  : `Ошибка: ${r.error}`,
              );
            })
          }
          className={styles.outline}
        >
          {running ? "Выполняется…" : "Синхронизировать сейчас"}
        </button>
        {saved && <span className="text-green-600 text-sm">Сохранено ✓</span>}
        </div>
        <div className={styles.status}>
          <p>Последняя попытка: {attemptText} · Последний успех: {successText}</p>
          {running && <p>Синхронизация выполняется…</p>}
          {stuck && (
            <p role="alert">
              Последняя попытка прервана (сервер не ответил). Параметры сохранены — запустите синхронизацию снова.
            </p>
          )}
          {lastError && !running && <p role="alert">Ошибка: {lastError}</p>}
          {result && <p role="status">{result}</p>}
        </div>
    </div>
  );
}
