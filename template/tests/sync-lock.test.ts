import { describe, expect, it } from "vitest";
import { SYNC_LOCK_STALE_MS, isSyncLockStale } from "@/lib/yandex-eda/sync-lock";

const NOW = new Date("2026-10-08T12:00:00.000Z");

describe("isSyncLockStale (F05: зависшая синхронизация)", () => {
  it("свободная блокировка (running отсутствует) не stale", () => {
    expect(isSyncLockStale({}, NOW)).toBe(false);
    expect(isSyncLockStale({ running: false }, NOW)).toBe(false);
  });

  it("свежий running не stale", () => {
    const fresh = new Date(NOW.getTime() - 60_000).toISOString();
    expect(isSyncLockStale({ running: true, lastAttempt: fresh }, NOW)).toBe(false);
  });

  it("running старше порога — stale (процесс умер, не отпустил блокировку)", () => {
    const old = new Date(NOW.getTime() - SYNC_LOCK_STALE_MS - 1).toISOString();
    expect(isSyncLockStale({ running: true, lastAttempt: old }, NOW)).toBe(true);
  });

  it("running без lastAttempt — stale (некорректное состояние)", () => {
    expect(isSyncLockStale({ running: true }, NOW)).toBe(true);
  });

  it("отсутствующая запись — не stale", () => {
    expect(isSyncLockStale(undefined, NOW)).toBe(false);
  });
});
