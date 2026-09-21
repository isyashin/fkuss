import { describe, expect, it } from "vitest";
import {
  canRequestExport,
  exportRequestData,
  resolveExportArchive,
} from "@/lib/export-access";

describe("export archive access", () => {
  const exportDir = "/srv/resto/backups/export";

  it("resolves only a portable archive name inside the configured export directory", () => {
    expect(resolveExportArchive(exportDir, "bistro-20260921-120000.tar.gz")).toBe(
      "/srv/resto/backups/export/bistro-20260921-120000.tar.gz",
    );
  });

  it.each([
    "../other.tar.gz",
    "/srv/resto/backups/export/other.tar.gz",
    "bistro-20260921-120000.tar.gz/../../secret",
    "bistro-20260921-120000.partial",
    "bistro-20260921-120000.tar.gz.bak",
  ])("rejects an unsafe or incomplete stored archive name: %s", (storedName) => {
    expect(resolveExportArchive(exportDir, storedName)).toBeNull();
  });
});

describe("export ownership and repeat state", () => {
  it("allows an owner to request only their own site", () => {
    expect(canRequestExport("bistro", "bistro")).toBe(true);
    expect(canRequestExport("bistro", "other-site")).toBe(false);
  });

  it("clears a previous ready archive when a new export is requested", () => {
    const requestedAt = new Date("2026-09-21T12:00:00.000Z");
    expect(exportRequestData(requestedAt)).toEqual({
      exportRequestedAt: requestedAt,
      exportReadyPath: null,
    });
  });
});
