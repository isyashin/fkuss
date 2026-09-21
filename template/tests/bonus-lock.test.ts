import { describe, expect, it, vi } from "vitest";
import { lockAndCheckBonusBalance } from "@/lib/order/bonus-lock";

describe("lockAndCheckBonusBalance", () => {
  it("takes a per-customer database lock before reading the balance", async () => {
    const calls: string[] = [];
    const tx = {
      $executeRaw: vi.fn(async () => {
        calls.push("lock");
        return 1;
      }),
      bonusTransaction: {
        aggregate: vi.fn(async () => {
          calls.push("aggregate");
          return { _sum: { amount: 500 } };
        }),
      },
    };

    await expect(lockAndCheckBonusBalance(tx, "customer-1", 300)).resolves.toBe(true);
    expect(calls).toEqual(["lock", "aggregate"]);
  });

  it("rejects spending more than the locked balance", async () => {
    const tx = {
      $executeRaw: vi.fn(async () => 1),
      bonusTransaction: {
        aggregate: vi.fn(async () => ({ _sum: { amount: 199 } })),
      },
    };

    await expect(lockAndCheckBonusBalance(tx, "customer-1", 200)).resolves.toBe(false);
  });
});
