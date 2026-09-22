import { describe, expect, it, afterEach } from "vitest";
import { mkdir, mkdtemp, realpath, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getContentDir, resolveContentFile, resolveContentPath } from "@/lib/content-dir";

const previous = process.env.CONTENT_DIR;
afterEach(() => {
  if (previous === undefined) delete process.env.CONTENT_DIR;
  else process.env.CONTENT_DIR = previous;
});

describe("content directory", () => {
  it("uses CONTENT_DIR when configured", () => {
    process.env.CONTENT_DIR = "tenant-content";
    expect(getContentDir()).toBe(path.resolve("tenant-content"));
  });

  it("rejects traversal and accepts nested files", () => {
    process.env.CONTENT_DIR = "tenant-content";
    expect(resolveContentPath("images/logo.png")).toBe(path.resolve("tenant-content/images/logo.png"));
    expect(resolveContentPath("../secret.txt")).toBeNull();
  });

  it("rejects a symlink that escapes CONTENT_DIR", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "content-dir-"));
    const outside = path.join(os.tmpdir(), `outside-${Date.now()}.txt`);
    await mkdir(path.join(root, "images"), { recursive: true });
    await writeFile(outside, "secret");
    process.env.CONTENT_DIR = root;
    const link = path.join(root, "images", "escape.txt");
    try {
      await symlink(outside, link);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EPERM") return;
      throw error;
    }

    expect(await resolveContentFile("images/escape.txt")).toBeNull();
  });

  it("resolves an existing regular file inside CONTENT_DIR", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "content-dir-"));
    await mkdir(path.join(root, "images"), { recursive: true });
    const file = path.join(root, "images", "logo.png");
    await writeFile(file, "logo");
    process.env.CONTENT_DIR = root;

    expect(await resolveContentFile("images/logo.png")).toBe(await realpath(file));
  });
});
