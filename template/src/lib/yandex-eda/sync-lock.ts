/** Статус блокировки синхронизации меню (F05).
    Процесс, взявший running=true, мог умереть и не отпустить блокировку —
    тогда следующий запуск разрешён по давности lastAttempt. */

export const SYNC_LOCK_STALE_MS = 10 * 60 * 1000; // 10 минут

export function isSyncLockStale(previous: Record<string, unknown> | undefined, now: Date): boolean {
  if (!previous || previous.running !== true) return false;
  const lastAttempt = previous.lastAttempt;
  if (typeof lastAttempt !== "string" || Number.isNaN(Date.parse(lastAttempt))) return true;
  return now.getTime() - Date.parse(lastAttempt) > SYNC_LOCK_STALE_MS;
}
