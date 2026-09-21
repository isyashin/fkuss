import { describe, expect, it } from "vitest";
import { isSyncDue } from "@/app/api/jobs/sync-menu/route";

describe("sync-menu cron eligibility", () => {
  it("keeps intervalMinutes as a server-side gate", () => {
    const now = Date.parse("2026-09-21T12:00:00.000Z");

    expect(isSyncDue("2026-09-21T11:46:00.000Z", 15, now)).toBe(false);
    expect(isSyncDue("2026-09-21T11:45:00.000Z", 15, now)).toBe(true);
  });

  it("does not let an invalid persisted state disable future syncs", () => {
    expect(isSyncDue("not-a-date", 60, Date.now())).toBe(true);
  });
});
