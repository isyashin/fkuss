import assert from "node:assert/strict";
import test from "node:test";
import { normalizePhoneNumber } from "./contact-links.mjs";

test("normalizes guest phones to international digits for messenger links", () => {
  assert.equal(normalizePhoneNumber("+7 (903) 555-23-92"), "79035552392");
  assert.equal(normalizePhoneNumber("8 903 555-23-92"), "79035552392");
  assert.equal(normalizePhoneNumber("903 555-23-92"), "79035552392");
  assert.equal(normalizePhoneNumber("+1 (202) 555-0123"), "12025550123");
});

test("rejects missing and incomplete phone numbers", () => {
  assert.equal(normalizePhoneNumber(""), null);
  assert.equal(normalizePhoneNumber("903-55"), null);
});
