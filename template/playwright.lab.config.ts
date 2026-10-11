import { defineConfig, devices } from "@playwright/test";

// ДИАГНОСТИКА (не коммитить): прогон E2E против лаб-полигона без webServer.
export default defineConfig({
  testDir: "./e2e",
  timeout: 300_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://192.168.88.153:3006",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
  ],
});
