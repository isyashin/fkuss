import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ isAdmin: vi.fn(), getAdminActor: vi.fn(), getSiteSettings: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({ isAdmin: mocks.isAdmin, getAdminActor: mocks.getAdminActor }));
vi.mock("@/lib/site", () => ({ getSiteSettings: mocks.getSiteSettings }));
vi.mock("@/lib/db", () => ({ getPrisma: vi.fn() }));
vi.mock("@/lib/mailer", () => ({ sendMail: vi.fn() }));
import { GET } from "@/app/api/admin/guest-cabinet/route";

describe("guest cabinet configuration permission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSiteSettings.mockResolvedValue({ guestCabinet: {
      enabled: true, authMode: "email", smtpUrl: "smtps://fixture:fake@example.test:465", smtpFrom: "fixture@example.test",
    } });
  });

  it.each(["anonymous", "staff without PIN", "revoked session"])("denies %s without reading SMTP", async (kind) => {
    mocks.isAdmin.mockResolvedValue(false);
    mocks.getAdminActor.mockResolvedValue(kind === "staff without PIN" ? { id: "staff", role: "staff" } : null);
    const response = await GET();
    expect(response.status).toBe(403);
    expect(await response.json()).not.toHaveProperty("smtpUrl");
    expect(mocks.getSiteSettings).not.toHaveBeenCalled();
    expect(mocks.isAdmin).toHaveBeenCalledWith("manage");
  });

  it.each(["owner", "staff with valid PIN"])("allows %s via the common manage permission", async () => {
    mocks.isAdmin.mockResolvedValue(true);
    mocks.getAdminActor.mockResolvedValue({ id: "actor", role: "owner" });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect((await response.json()).smtpUrl).toBe("smtps://fixture:fake@example.test:465");
    expect(mocks.isAdmin).toHaveBeenCalledWith("manage");
  });
});
