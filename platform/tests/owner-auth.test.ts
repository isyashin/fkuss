import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieValue: undefined as string | undefined,
  findUnique: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => (mocks.cookieValue ? { value: mocks.cookieValue } : undefined),
    set: vi.fn(),
  })),
}));

vi.mock("@/lib/db", () => ({
  getPrisma: () => ({ ownerAccount: { findUnique: mocks.findUnique } }),
}));

import { getSessionOwner } from "@/lib/owner-auth";

function signedCookie(id: string, issuedAt: number, secret: string): string {
  const payload = `${id}.${issuedAt}`;
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

describe("owner session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("SESSION_SECRET", "test-session-secret");
    delete process.env.PLATFORM_ADMIN_PASSWORD;
    mocks.cookieValue = undefined;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects the legacy unsigned owner id", async () => {
    mocks.cookieValue = "owner-1";

    await expect(getSessionOwner()).resolves.toBeNull();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("accepts a fresh correctly signed session", async () => {
    const owner = { id: "owner-1" };
    mocks.cookieValue = signedCookie(owner.id, Date.now(), process.env.SESSION_SECRET!);
    mocks.findUnique.mockResolvedValue(owner);

    await expect(getSessionOwner()).resolves.toBe(owner);
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { id: owner.id } });
  });

  it("rejects a tampered owner id", async () => {
    const issuedAt = Date.now();
    const original = signedCookie("owner-1", issuedAt, process.env.SESSION_SECRET!);
    mocks.cookieValue = original.replace("owner-1", "owner-2");

    await expect(getSessionOwner()).resolves.toBeNull();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("rejects a signed session after 30 days", async () => {
    const olderThanThirtyDays = Date.now() - 30 * 24 * 60 * 60 * 1000 - 1;
    mocks.cookieValue = signedCookie(
      "owner-1",
      olderThanThirtyDays,
      process.env.SESSION_SECRET!,
    );

    await expect(getSessionOwner()).resolves.toBeNull();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("fails closed in production when no signing secret is configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.SESSION_SECRET;
    delete process.env.PLATFORM_ADMIN_PASSWORD;
    mocks.cookieValue = `owner-1.${Date.now()}.invalid`;

    await expect(getSessionOwner()).rejects.toThrow("SESSION_SECRET");
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});
