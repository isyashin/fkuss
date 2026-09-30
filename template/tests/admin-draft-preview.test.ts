import { describe, expect, it } from "vitest";
import { adminDraftItemsTotal, adminDraftLineUnit } from "@/lib/admin-draft-preview";

describe("admin order draft preview", () => {
  it("keeps an existing order item's snapshot price and modifiers", () => {
    const line = { kind: "existing" as const, quantity: 2, item: { price: 300, modifiers: [{ price: 40 }] } };
    expect(adminDraftLineUnit(line, new Map())).toBe(340);
    expect(adminDraftItemsTotal([line], new Map())).toBe(680);
  });

  it("uses current catalog prices for newly added dishes", () => {
    const dishMap = new Map([["dish", { price: 500, modifiers: [{ id: "extra", price: 50 }], groups: [] }]]);
    const line = { kind: "new" as const, quantity: 2, dishId: "dish", modifierIds: ["extra"] };
    expect(adminDraftItemsTotal([line], dishMap)).toBe(1100);
  });
});
