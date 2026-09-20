"use client";

import { useState, useTransition } from "react";
import { saveSyncSettings, runSyncNow } from "./actions";
import type { ContentSettings } from "@/lib/content-schema";

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
    <div className="space-y-6 max-w-xl">
      <section className="bg-card rounded-[var(--radius)] p-5 space-y-4">
        <label className="flex items-center gap-3 min-h-11">
          <input
            type="checkbox"
            checked={sync.enabled}
            onChange={(e) => setSync({ ...sync, enabled: e.target.checked })}
            className="w-5 h-5 accent-[var(--accent)]"
          />
          Автоматическая синхронизация по расписанию
        </label>

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

        <button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await saveSyncSettings(sync);
              setSaved(true);
              setTimeout(() => setSaved(false), 3000);
            })
          }
          className="min-h-11 px-5 rounded-full bg-accent text-white text-sm font-medium disabled:opacity-50"
        >
          Сохранить
        </button>
        {saved && <span className="ml-3 text-green-600 text-sm">Сохранено ✓</span>}
      </section>

      <section className="bg-card rounded-[var(--radius)] p-5 space-y-3">
        <h2 className="text-lg">Состояние</h2>
        <div className="text-sm text-muted space-y-1">
          <p>Последняя попытка: {lastAttempt ? new Date(lastAttempt).toLocaleString("ru-RU") : "—"}</p>
          <p>Последний успех: {lastSuccess ? new Date(lastSuccess).toLocaleString("ru-RU") : "—"}</p>
          {running && <p className="text-amber-600">⏳ Синхронизация выполняется…</p>}
          {lastError && !running && (
            <p className="text-red-600 bg-red-50 rounded-lg p-2">Ошибка: {lastError}</p>
          )}
        </div>

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
          className="min-h-12 px-6 rounded-full bg-accent text-white font-medium disabled:opacity-50"
        >
          {running ? "Выполняется…" : "Синхронизировать сейчас"}
        </button>
        {result && <p className="text-sm">{result}</p>}
      </section>
    </div>
  );
}
