/** Версионирование настроек для обнаружения конфликта параллельных правок (F04).
    Версия живёт внутри JSON-строки настроек (key "settings") — миграция не нужна. */

import type { PrismaClient } from "@/generated/prisma/client";

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

/** Атомарная версионированная запись строки настроек (key "settings").
    Advisory-лок сериализует писателей внутри транзакции, проверка _rev идёт
    после блокировки — при двух действительно одновременных сохранениях оба
    запроса не пройдут проверку (замечание аудита 11.10). Возвращает новую
    ревизию или "conflict"; клиент обязан принять возвращённую ревизию, иначе
    его следующее сохранение ложно конфликтует. */
export async function writeSettingsVersioned(
  db: PrismaClient,
  next: (current: Record<string, unknown>) => Record<string, unknown>,
  expectedRev: number | null,
  force = false,
): Promise<number | "conflict"> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('settings-settings-row'))`;
    const row = await tx.settings.findUnique({ where: { key: "settings" } });
    let rev: number;
    try {
      rev = assertSettingsRev(row?.value ?? null, expectedRev, force);
    } catch (error) {
      if (isSettingsConflict(error)) return "conflict";
      throw error;
    }
    const current = (row?.value ?? {}) as Record<string, unknown>;
    const value = JSON.parse(JSON.stringify({ ...next(current), _rev: rev }));
    await tx.settings.upsert({ where: { key: "settings" }, create: { key: "settings", value }, update: { value } });
    return rev;
  });
}
