import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // Billing scans all sites. Provision tests create/delete sites in the same
    // disposable DB, so files cannot run concurrently against that shared DB.
    fileParallelism: false,
  },
});
