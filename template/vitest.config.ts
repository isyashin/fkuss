import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // Интеграционные файлы используют одну одноразовую БД и bootstrap владельца.
    fileParallelism: false,
  },
});
