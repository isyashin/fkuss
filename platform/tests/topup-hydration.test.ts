import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/app/cabinet/topup-action", () => ({ topupAction: vi.fn() }));
import { TopupForm } from "@/app/cabinet/topup-form";

describe("money input before hydration", () => {
  it("does not accept a new amount before its change handler is attached", () => {
    vi.stubGlobal("React", React);
    try {
      const html = renderToStaticMarkup(createElement(TopupForm, { slug: "qa" }));
      expect(html).toMatch(/<input[^>]*disabled=""/);
      expect(html).toMatch(/<button[^>]*disabled=""/);
    } finally { vi.unstubAllGlobals(); }
  });
});
