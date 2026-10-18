import { describe, expect, it } from "vitest";
import { createOrderConfirmationToken, isOrderConfirmationTokenValid, ORDER_CONFIRMATION_TTL_SECONDS } from "../src/lib/order-confirmation";
const secret = "disposable-confirmation-test-secret";
const now = 1_000_000;
describe("private receipt proof", () => {
  it("authorizes only the order created in this browser context", () => {
    const proof = createOrderConfirmationToken("order-a", secret, now);
    expect(proof).toEqual(expect.any(String));
    expect(isOrderConfirmationTokenValid(proof!, "order-a", secret, now + 1000)).toBe(true);
    expect(isOrderConfirmationTokenValid(proof!, "order-b", secret, now + 1000)).toBe(false);
    expect(isOrderConfirmationTokenValid(proof!, "order-a", "other-tenant", now + 1000)).toBe(false);
    expect(isOrderConfirmationTokenValid(proof!, "order-a", secret, now + ORDER_CONFIRMATION_TTL_SECONDS * 1000)).toBe(false);
    expect(isOrderConfirmationTokenValid(proof! + "tamper", "order-a", secret, now)).toBe(false);
  });
  it("fails closed without a secret or with malformed proof", () => {
    expect(createOrderConfirmationToken("order-a", undefined, now)).toBeNull();
    for (const value of [undefined, "", "broken", "a.b.c", "x".repeat(2000)]) expect(isOrderConfirmationTokenValid(value, "order-a", secret, now)).toBe(false);
  });
});
