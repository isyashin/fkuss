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
      SITE_KEY: "e2e-test-site-key",
      ADMIN_LOGIN_ATTEMPTS: "1000",
      // Только для E2E: выброшенная пара ключей, реальная доставка не выполняется
      // (транспорт push в тестах мокается на уровне браузера).
      VAPID_PUBLIC_KEY: "BOi3C8InmNrjQcp5LHfUmGDdeL_cyA2PJUBCPbiEhghC0sUu-L5EKw3tx5Eqw5l0WOkV8-NpuSOH1957hF6q10Q",
      VAPID_PRIVATE_KEY: "p5hhwy_D41mXieyJXyChe4i5ZArs5vykhbHZU8dwYBk",
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
