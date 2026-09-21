import { describe, expect, it, vi } from "vitest";
import { applyPaidTopup, claimLowBalanceNotification } from "@/lib/billing-ledger";

function setup(markedCount = 1) {
  const payment = { id: "pay-1", invoiceId: 7, siteId: "resto", amount: 50_000 };
  const tx = {
    payment: {
      findFirst: vi.fn(async () => payment),
      updateMany: vi.fn(async () => ({ count: markedCount })),
    },
    invoice: { update: vi.fn(async () => ({})) },
    balanceTransaction: { create: vi.fn(async () => ({})) },
    site: { updateMany: vi.fn(async () => ({ count: 1 })) },
  };
  const db = {
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<boolean>) => callback(tx)),
  };
  return { db, tx, payment };
}

describe("applyPaidTopup", () => {
  it("changes payment, invoice, ledger and site in one transaction", async () => {
    const { db, tx, payment } = setup();

    await expect(applyPaidTopup(db, 7, "provider-payment-1")).resolves.toBe(true);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.payment.updateMany).toHaveBeenCalledWith({
      where: { id: payment.id, status: "pending" },
      data: { status: "paid", providerPaymentId: "provider-payment-1" },
    });
    expect(tx.balanceTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        siteId: payment.siteId,
        amount: payment.amount,
        dedupeKey: `topup:${payment.id}`,
      }),
    });
  });

  it("does nothing when a concurrent webhook already marked the payment", async () => {
    const { db, tx } = setup(0);

    await expect(applyPaidTopup(db, 7, "provider-payment-1")).resolves.toBe(false);
    expect(tx.invoice.update).not.toHaveBeenCalled();
    expect(tx.balanceTransaction.create).not.toHaveBeenCalled();
    expect(tx.site.updateMany).not.toHaveBeenCalled();
  });

  it("propagates a ledger failure from the same transaction", async () => {
    const { db, tx } = setup();
    tx.balanceTransaction.create.mockRejectedValueOnce(new Error("ledger failed"));

    await expect(applyPaidTopup(db, 7, "provider-payment-1")).rejects.toThrow("ledger failed");
  });
});

describe("claimLowBalanceNotification", () => {
  it("uses a unique key scoped to the topup cycle and threshold", async () => {
    const create = vi.fn(async () => ({}));

    await expect(
      claimLowBalanceNotification({ balanceTransaction: { create } }, "resto", "topup-7", 3),
    ).resolves.toBe(true);
    expect(create).toHaveBeenCalledWith({
      data: {
        siteId: "resto",
        type: "adjustment",
        amount: 0,
        comment: "notify:3",
        dedupeKey: "notify:resto:topup-7:3",
      },
    });
  });

  it("lets only one concurrent run claim the same notification", async () => {
    const duplicate = Object.assign(new Error("duplicate"), { code: "P2002" });
    const create = vi.fn(async () => {
      throw duplicate;
    });

    await expect(
      claimLowBalanceNotification({ balanceTransaction: { create } }, "resto", "initial", 7),
    ).resolves.toBe(false);
  });

  it("does not hide non-unique database failures", async () => {
    const create = vi.fn(async () => {
      throw new Error("database unavailable");
    });

    await expect(
      claimLowBalanceNotification({ balanceTransaction: { create } }, "resto", "initial", 7),
    ).rejects.toThrow("database unavailable");
  });
});
