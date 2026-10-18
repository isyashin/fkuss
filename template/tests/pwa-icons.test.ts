import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { ensureIcons, getIconsVersion } from "@/lib/pwa-icons";

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

describe("existing-tenant PWA asset upgrade", () => {
  it("backfills old content without seed and leaves a complete set unchanged on a second run", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "pwa-upgrade-")); dirs.push(dir);
    await mkdir(path.join(dir, "icons"));
    await writeFile(path.join(dir, "restaurant.json"), "unchanged restaurant data");
    await writeFile(path.join(dir, "icons", "icon-192.png"), await sharp({ create: { width: 192, height: 192, channels: 4, background: "#ffffff" } }).png().toBuffer());
    await writeFile(path.join(dir, "icons", "icons.json"), JSON.stringify({ version: "legacy" }));
    expect(await ensureIcons(dir, { name: "Тест", logo: "" }, "#a33a24")).toBe(true);
    const version = await getIconsVersion(dir);
    expect(version).not.toBe("legacy");
    const files = ["icon-192.png", "icon-512.png", "apple-touch-icon.png", "admin-icon-192.png", "admin-icon-512.png", "admin-apple-touch-icon.png"];
    const before = await Promise.all(files.map((name) => readFile(path.join(dir, "icons", name))));
    for (const [i, data] of before.entries()) {
      const meta = await sharp(data).metadata();
      const size = [192, 512, 180, 192, 512, 180][i];
      expect([meta.format, meta.width, meta.height]).toEqual(["png", size, size]);
    }
    expect(await ensureIcons(dir, { name: "Тест", logo: "" }, "#a33a24")).toBe(false);
    expect(await getIconsVersion(dir)).toBe(version);
    expect(await Promise.all(files.map((name) => readFile(path.join(dir, "icons", name))))).toEqual(before);
    expect(await readFile(path.join(dir, "restaurant.json"), "utf8")).toBe("unchanged restaurant data");
    // A truncated icon is repaired too, not merely a missing filename.
    await writeFile(path.join(dir, "icons", "admin-icon-512.png"), "broken");
    expect(await ensureIcons(dir, { name: "Тест", logo: "" }, "#a33a24")).toBe(true);
    expect((await sharp(path.join(dir, "icons", "admin-icon-512.png")).metadata()).width).toBe(512);
  });
});
