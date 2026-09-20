import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
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
      name: "mobile",
      use: { ...devices["iPhone 13"] }, // мобильная эмуляция по умолчанию
    },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
