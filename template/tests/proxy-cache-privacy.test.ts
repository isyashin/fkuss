import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import proxy from "../src/proxy";

describe("proxy cache privacy", () => {
  it.each(["resto_session", "resto_admin_v2", "resto_order_confirmation", "resto_guest_orders"])("marks %s responses private even on the storefront", (name) => {
    const request = new NextRequest("https://site.example/", { headers: { cookie: `${name}=test-context`, "user-agent": "headless", accept: "text/html", "x-fkuss-cache": "public" } });
    expect(proxy(request).headers.get("x-fkuss-cache")).toBe("private");
  });
  it("keeps anonymous public documents eligible for caching", () => {
    const request = new NextRequest("https://site.example/", { headers: { "user-agent": "headless", accept: "text/html" } });
    expect(proxy(request).headers.get("x-fkuss-cache")).toBe("public");
  });
});
