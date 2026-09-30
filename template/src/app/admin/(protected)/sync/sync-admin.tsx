"use client";

import { useState, useTransition } from "react";
import { saveSyncSettings, runSyncNow } from "./actions";
import type { ContentSettings } from "@/lib/content-schema";
import styles from "./sync-admin.module.css";

export function SyncAdmin({
  settings,
  syncState,
}: {
  settings: ContentSettings;
  syncState: Record<string, unknown>;
}) {
  const [sync, setSync] = useState(settings.sync);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string>("");
  const [saved, setSaved] = useState(false);

  const inputCls = "mt-1 w-full min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15";
  const lastError = typeof syncState.lastError === "string" ? syncState.lastError : null;
  const lastSuccess = typeof syncState.lastSuccess === "string" ? syncState.lastSuccess : null;
  const lastAttempt = typeof syncState.lastAttempt === "string" ? syncState.lastAttempt : null;
  const running = syncState.running === true;

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
        <label className="block">
          <span className="text-sm text-muted">placeSlug ресторана в Яндекс.Еде</span>
          <input
            value={sync.placeSlug}
            onChange={(e) => setSync({ ...sync, placeSlug: e.target.value })}
            placeholder="chajxana_buxara_xalyal"
            className={inputCls}
          />
        </label>

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
          <p>Последняя попытка: {lastAttempt ? new Date(lastAttempt).toLocaleString("ru-RU") : "—"} · Последний успех: {lastSuccess ? new Date(lastSuccess).toLocaleString("ru-RU") : "—"}</p>
          {running && <p>Синхронизация выполняется…</p>}
          {lastError && !running && <p role="alert">Ошибка: {lastError}</p>}
          {result && <p role="status">{result}</p>}
        </div>
    </div>
  );
}
