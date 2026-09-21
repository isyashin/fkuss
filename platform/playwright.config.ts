import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1, // общий баланс сайта — прогоняем последовательно
  use: { baseURL: "http://localhost:3100" },
  webServer: {
    command: "npx next start -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: process.env.PLATFORM_DATABASE_URL ?? "",
      AUTH_DEV_CODE: "1",
      SESSION_SECRET: "platform-e2e-session-secret",
      INSECURE_HTTP: "1",
      PLATFORM_BASE_URL: "http://localhost:3100",
      PLATFORM_PAYMENT_PROVIDER: "mock",
      ALLOW_MOCK_PAYMENT: "1",
    },
  },
  projects: [
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "webkit" } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
});
