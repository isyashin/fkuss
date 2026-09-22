import { describe, expect, it } from "vitest";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { checkContentReadiness } from "../src/lib/content-readiness";

const base = () => ({
  restaurant: { logo: "images/logo.png", phone: "+79991234567", email: "hello@bistro.ru" },
  menu: { categories: [{ dishes: [{ image: "images/dish.webp" }] }] },
  promos: { promos: [] },
  theme: { background: { image: "" } },
  settings: {
    domains: { canonical: "bistro.fkuss.ru" },
    channels: { email: { address: "orders@bistro.ru" } },
  },
});

describe("content readiness", () => {
  it("reports missing logo", async () => {
    const dir = await os.tmpdir();
    const result = await checkContentReadiness(path.join(dir, `readiness-${Date.now()}`), base());
    expect(result.some((e) => e.includes("restaurant.logo"))).toBe(true);
  });

  it("rejects draft contacts and accepts valid files", async () => {
    const dir = await import("node:fs/promises").then(({ mkdtemp }) => mkdtemp(path.join(os.tmpdir(), "readiness-")));
    await mkdir(path.join(dir, "images"), { recursive: true });
    await writeFile(path.join(dir, "images", "logo.png"), "logo");
    await writeFile(path.join(dir, "images", "dish.webp"), "dish");
    expect((await checkContentReadiness(dir, { ...base(), restaurant: { ...base().restaurant, phone: "DRAFT_PHONE_REPLACE_ME" } })).some((e) => e.includes("draft"))).toBe(true);
    expect(await checkContentReadiness(dir, base())).toEqual([]);
  });

  it("rejects symlink escape when supported", async () => {
    const dir = await import("node:fs/promises").then(({ mkdtemp }) => mkdtemp(path.join(os.tmpdir(), "readiness-")));
    await mkdir(path.join(dir, "images"), { recursive: true });
    await writeFile(path.join(dir, "outside.png"), "outside");
    try {
      await symlink(path.join(dir, "outside.png"), path.join(dir, "images", "logo.png"));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") return;
      throw error;
    }
    const result = await checkContentReadiness(dir, { ...base(), menu: { categories: [] } });
    expect(result.some((e) => e.includes("symlink") || e.includes("обычным файлом"))).toBe(true);
  });

  it("rejects draft canonical and notification email", async () => {
    const dir = await import("node:fs/promises").then(({ mkdtemp }) => mkdtemp(path.join(os.tmpdir(), "readiness-")));
    await mkdir(path.join(dir, "images"), { recursive: true });
    await writeFile(path.join(dir, "images", "logo.png"), "logo");
    await writeFile(path.join(dir, "images", "dish.webp"), "dish");
    const input = base();
    input.settings.domains.canonical = "bistro.example.ru";
    input.settings.channels.email.address = "orders@example.ru";

    const result = await checkContentReadiness(dir, input);

    expect(result.some((e) => e.includes("canonical"))).toBe(true);
    expect(result.some((e) => e.includes("channels.email"))).toBe(true);
  });
});
