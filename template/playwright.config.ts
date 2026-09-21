import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  globalTeardown: "./e2e/global-teardown.ts",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1, // Один сайт на все тесты: параллельные прогоны ломают общее состояние
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
  },
  webServer: {
    command: "npx next start",
    url: "http://localhost:3000",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      AUTH_DEV_CODE: "1",
      INSECURE_HTTP: "1",
      ADMIN_PASSWORD: "admin",
    },
  },
  projects: [
    {
      name: "mobile-360",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 360, height: 800 },
        extraHTTPHeaders: { "x-forwarded-for": "10.99.200.1" },
      },
    },
    {
      name: "webkit-mobile",
      use: {
        ...devices["iPhone 13"],
        browserName: "webkit",
        extraHTTPHeaders: { "x-forwarded-for": "10.99.200.2" },
      },
    },
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        extraHTTPHeaders: { "x-forwarded-for": "10.99.200.3" },
      },
    },
  ],
});
