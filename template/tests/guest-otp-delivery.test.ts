import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), sendMail: vi.fn() }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ authCode: { create: mocks.create } }) }));
vi.mock("@/lib/mailer", () => ({ sendMail: mocks.sendMail }));

import { requestAuthCode } from "@/lib/auth";

describe("guest OTP delivery failure", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_DEV_CODE", "0");
    mocks.create.mockResolvedValue({});
    mocks.sendMail.mockRejectedValue(new Error("SMTP unavailable"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    mocks.create.mockReset();
    mocks.sendMail.mockReset();
  });

  it("reports failure when production SMTP cannot deliver", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await requestAuthCode("otp-test@example.invalid");
    expect(result).toEqual({ deliveryFailed: true });
  });

  it("returns the code only in explicit dev mode without logging it", async () => {
    vi.stubEnv("AUTH_DEV_CODE", "1");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await requestAuthCode("otp-test@example.invalid");
    expect(result.devCode).toMatch(/^\d{6}$/);
    expect(log.mock.calls.length).toBe(0);
  });
});
