import test from "node:test";
import assert from "node:assert/strict";
import { calculatePreviewTotal } from "./preview-total.mjs";

test("preview total follows local quantity changes and ignores removed items", () => {
  const prices = { a: 790, b: 325 };
  assert.equal(calculatePreviewTotal([{ id: "a", quantity: 2 }, { id: "b", quantity: 1 }], prices), 1905);
  assert.equal(calculatePreviewTotal([{ id: "a", quantity: 1 }], prices), 790);
});

test("preview total cannot become negative", () => {
  assert.equal(calculatePreviewTotal([{ id: "a", quantity: -3 }], { a: 790 }), 0);
});
