import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ create: vi.fn(async () => ({})) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/platform-admin-auth", () => ({ isPlatformAdmin: async () => true }));
vi.mock("@/lib/db", () => ({ getPrisma: () => ({ balanceTransaction: { create: mock.create } }) }));
import { adjustBalance } from "@/app/admin/sites/[slug]/actions";
beforeEach(() => vi.clearAllMocks());
describe("manual financial input", () => {
  it.each([NaN, Infinity, -Infinity, 999_999_999_999, 1.001, -21_474_836.49])("rejects %s without writing or throwing", async (amount) => {
    await expect(adjustBalance("qa", amount, "Причина")).resolves.toEqual({ ok: false, fieldErrors: { amount: expect.any(String) } });
    expect(mock.create).not.toHaveBeenCalled();
  });
  it("returns a comment error for whitespace and keeps the operation unrecorded", async () => {
    await expect(adjustBalance("qa", 1, "   ")).resolves.toEqual({ ok: false, fieldErrors: { comment: expect.any(String) } });
    expect(mock.create).not.toHaveBeenCalled();
  });
  it.each([1.1, 19.99, -3.25])("writes exact integer kopecks once for %s", async (amount) => {
    await expect(adjustBalance("qa", amount, "  Причина  ")).resolves.toEqual({ ok: true });
    expect(mock.create).toHaveBeenCalledOnce();
    expect(mock.create).toHaveBeenCalledWith({ data: expect.objectContaining({ amount: Math.round(amount * 100), comment: "Ручная операция: Причина" }) });
  });
});
