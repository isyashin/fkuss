import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Локальный прогон: порт 3000 занят чужим dev-сервером, поднимаем свой на 3001.
export default defineConfig({
  ...base,
  webServer: {
    ...base.webServer,
    command: "npx next start -p 3001",
    url: "http://localhost:3001",
  },
  use: { ...base.use, baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3001" },
});
