import { describe, expect, it } from "vitest";
import { isGuestOrderFinished, reconcileGuestOrders, type GuestOrderSummary } from "@/lib/order/guest-order-state";

function order(patch: Partial<GuestOrderSummary> = {}): GuestOrderSummary {
  return { id: "one", number: 42, type: "delivery", status: "new", paymentStatus: "none", paymentMethod: "cash", total: 450, createdAt: "2026-10-21T10:00:00Z", updatedAt: "2026-10-21T10:00:00Z", requestKey: "key", ...patch };
}
describe("guest order lifecycle", () => {
  it.each(["new", "accepted", "cooking", "ready", "handed_to_courier"])("retains delivery at %s, including paid orders", status => {
    expect(isGuestOrderFinished(order({ status, paymentStatus: "paid" }))).toBe(false);
  });
  it("finishes only issued pickup, delivered delivery or cancellation", () => {
    expect(isGuestOrderFinished(order({ status: "delivered" }))).toBe(true);
    expect(isGuestOrderFinished(order({ type: "pickup", status: "issued" }))).toBe(true);
    expect(isGuestOrderFinished(order({ type: "pickup", status: "ready" }))).toBe(false);
    expect(isGuestOrderFinished(order({ status: "issued" }))).toBe(false);
    expect(isGuestOrderFinished(order({ status: "cancelled", paymentStatus: "pending" }))).toBe(true);
    expect(isGuestOrderFinished(order({ paymentStatus: "failed" }))).toBe(false);
  });
  it("does not lose known orders when a poll has missing records", () => {
    expect(reconcileGuestOrders([order()], [], {})).toEqual([order()]);
  });
  it("updates one order without erasing another or reviving acknowledged completion", () => {
    const done = order({ status: "delivered", updatedAt: "2026-10-21T11:00:00Z" });
    const other = order({ id: "two", number: 43 });
    expect(reconcileGuestOrders([order(), other], [done], { one: done.updatedAt })).toEqual([other]);
  });
});
