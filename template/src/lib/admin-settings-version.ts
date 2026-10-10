/** Версионирование настроек для обнаружения конфликта параллельных правок (F04).
    Версия живёт внутри JSON-строки настроек (key "settings") — миграция не нужна. */

export const SETTINGS_CONFLICT = "SETTINGS_CONFLICT";

/** Текущая версия из сырого значения Settings.value (или 0, если версий ещё не было). */
export function readSettingsRev(raw: unknown): number {
  const value = (raw as { _rev?: unknown } | null | undefined)?._rev;
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

/** Проверяет ожидаемую версию и возвращает следующую для записи.
    expectedRev: null/undefined — проверка не выполняется (устаревшие вызовы).
    force: true — обход проверки (явная «Перезаписать» из диалога конфликта). */
export function assertSettingsRev(raw: unknown, expectedRev: number | null | undefined, force = false): number {
  const current = readSettingsRev(raw);
  if (!force && expectedRev != null && expectedRev !== current) {
    throw new Error(SETTINGS_CONFLICT);
  }
  return current + 1;
}

export function isSettingsConflict(error: unknown): boolean {
  return error instanceof Error && error.message === SETTINGS_CONFLICT;
}
