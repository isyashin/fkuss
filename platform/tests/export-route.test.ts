import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const mock = vi.hoisted(() => ({ owner: { siteId: "qa" } as { siteId: string } | null, site: {} as Record<string, unknown> }));
vi.mock("@/lib/owner-auth", () => ({ getSessionOwner: async () => mock.owner }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ site: { findUnique: async () => mock.site } }) }));
import { GET } from "@/app/api/export/download/route";
let directory: string;
const old = process.env.EXPORT_DIR;
beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "fkuss-export-test-"));
  process.env.EXPORT_DIR = directory;
  await writeFile(path.join(directory, "qa-20261016-120000.tar.gz"), "QA archive");
});
beforeEach(() => {
  mock.owner = { siteId: "qa" };
  mock.site = { exportReadyPath: "qa-20261016-120000.tar.gz", exportExpiresAt: new Date(Date.now() + 3600_000) };
});
afterAll(async () => {
  if (old === undefined) delete process.env.EXPORT_DIR; else process.env.EXPORT_DIR = old;
  await rm(directory, { recursive: true, force: true });
});
describe("export download", () => {
  it("downloads a fresh owned archive without public caching", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.text()).toBe("QA archive");
  });
  it("refuses an expired archive even when cleanup has not deleted it", async () => {
    mock.site.exportExpiresAt = new Date(Date.now() - 1);
    expect((await GET()).status).toBe(410);
  });
  it("refuses missing expiry and foreign names", async () => {
    mock.site.exportExpiresAt = null;
    expect((await GET()).status).toBe(410);
    mock.site.exportReadyPath = "other-20261016-120000.tar.gz";
    expect((await GET()).status).toBe(403);
  });
  it("requires an owner session", async () => {
    mock.owner = null;
    expect((await GET()).status).toBe(403);
  });
});
