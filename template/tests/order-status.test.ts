import { describe, expect, it } from "vitest";
import {
  ORDER_STATUS_CODES,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_CHAINS,
  canTransitionOrder,
  isFinalOrderStatus,
  nextOrderStatus,
  orderActionsFor,
  statusAfterSuccessfulPayment,
} from "@/lib/order-status";

describe("canonical order statuses", () => {
  it("defines a different strictly ordered chain for delivery and pickup", () => {
    expect(ORDER_STATUS_CHAINS.delivery).toEqual(["new", "accepted", "cooking", "ready", "handed_to_courier", "delivered"]);
    expect(ORDER_STATUS_CHAINS.pickup).toEqual(["new", "accepted", "cooking", "ready", "issued"]);
    expect(ORDER_STATUS_CODES).toContain("cancelled");
    expect(ORDER_STATUS_LABELS.handed_to_courier).toBe("Передан курьеру");
  });

  it.each([
    ["delivery", "new", "accepted"],
    ["delivery", "accepted", "cooking"],
    ["delivery", "cooking", "ready"],
    ["delivery", "ready", "handed_to_courier"],
    ["delivery", "handed_to_courier", "delivered"],
    ["pickup", "new", "accepted"],
    ["pickup", "accepted", "cooking"],
    ["pickup", "cooking", "ready"],
    ["pickup", "ready", "issued"],
  ])("allows only %s %s → %s", (type, from, to) => {
    expect(nextOrderStatus(type, from)).toBe(to);
    expect(canTransitionOrder(type, from, to)).toBe(true);
  });

  it.each([
    ["delivery", "new", "ready"],
    ["delivery", "ready", "delivered"],
    ["delivery", "handed_to_courier", "cooking"],
    ["delivery", "delivered", "cancelled"],
    ["delivery", "ready", "issued"],
    ["pickup", "cooking", "issued"],
    ["pickup", "ready", "handed_to_courier"],
    ["pickup", "issued", "ready"],
    ["pickup", "cancelled", "accepted"],
    ["unknown", "new", "accepted"],
  ])("rejects %s %s → %s", (type, from, to) => {
    expect(canTransitionOrder(type, from, to)).toBe(false);
  });

  it("keeps cancellation separate and unavailable after either final state", () => {
    expect(canTransitionOrder("delivery", "ready", "cancelled")).toBe(true);
    expect(canTransitionOrder("delivery", "handed_to_courier", "cancelled")).toBe(true);
    expect(canTransitionOrder("pickup", "ready", "cancelled")).toBe(true);
    expect(orderActionsFor("pickup", "ready").map((action) => action.status)).toEqual(["issued", "cancelled"]);
    expect(orderActionsFor("delivery", "delivered")).toEqual([]);
  });

  it("identifies only the proper final state for each order type", () => {
    expect(isFinalOrderStatus("delivery", "delivered")).toBe(true);
    expect(isFinalOrderStatus("pickup", "issued")).toBe(true);
    expect(isFinalOrderStatus("delivery", "issued")).toBe(false);
    expect(isFinalOrderStatus("pickup", "ready")).toBe(false);
  });

  it("accepts a paid new order immediately without moving an order already in progress", () => {
    expect(statusAfterSuccessfulPayment("new")).toBe("accepted");
    expect(statusAfterSuccessfulPayment("cooking")).toBe("cooking");
    expect(statusAfterSuccessfulPayment("cancelled")).toBe("cancelled");
  });
});
