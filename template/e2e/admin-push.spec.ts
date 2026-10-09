import { test, expect, type Page } from "@playwright/test";
import { loginAdminUi } from "./login-admin";

/**
 * PWA админки: отдельное устанавливаемое приложение рядом с гостевым.
 * Push-транспорт в этих тестах мокается в браузере (реальная доставка —
 * только ручная проверка на HTTPS-проде).
 */

async function expectSingleManifest(page: Page, href: string) {
  const manifest = page.locator('link[rel="manifest"]');
  await expect(manifest).toHaveCount(1);
  await expect(manifest).toHaveAttribute("href", href);
}

test.describe("PWA админки", () => {
  test("гостевая страница по-прежнему ссылается на гостевой манифест", async ({ page }) => {
    await page.goto("/");
    await expectSingleManifest(page, "/manifest.webmanifest");
  });

  test("гостевой манифест не изменился: start_url /, без scope админки", async ({ request }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.ok()).toBe(true);
    const manifest = await response.json();
    expect(manifest.start_url).toBe("/");
    expect(manifest.id ?? "/").toBe("/");
    expect(manifest.scope ?? "/").toBe("/");
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
  });

  test("страница входа админки даёт админский манифест и иконку iOS", async ({ page }) => {
    await page.goto("/admin/login");
    await expectSingleManifest(page, "/admin/manifest.webmanifest");
    const apple = page.locator('link[rel="apple-touch-icon"]');
    await expect(apple).toHaveAttribute("href", /admin-apple-touch-icon\.png\?v=/);
  });

  test("закрытая админка при перенаправлении на вход тоже даёт админский манифест", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/);
    await expectSingleManifest(page, "/admin/manifest.webmanifest");
  });

  test("админский манифест — отдельное приложение: id, start_url и scope /admin", async ({ request }) => {
    const response = await request.get("/admin/manifest.webmanifest");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("application/manifest+json");
    const manifest = await response.json();
    expect(manifest.id).toBe("/admin");
    expect(manifest.start_url).toBe("/admin");
    expect(manifest.scope).toBe("/admin");
    expect(manifest.display).toBe("standalone");
    expect(manifest.name).toContain("админка");
    expect(manifest.short_name).toBe("Админка");
    expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
    for (const icon of manifest.icons) {
      expect(icon.src).toContain("admin-icon-");
      expect(icon.src).toContain("?v=");
    }
  });

  test("service worker админки отдаётся только под /admin и обрабатывает push", async ({ request }) => {
    const response = await request.get("/admin/sw.js");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("javascript");
    const body = await response.text();
    expect(body).toContain('addEventListener("push"');
    expect(body).toContain("notificationclick");
    expect(body).toContain("/admin?selected=");
    expect(body).toContain("/admin/bookings?selected=");
    // Авторизованный контент не кэшируем
    expect(body).not.toContain('addEventListener("fetch"');
  });

  test("панель устройства доступна сотруднику и честно объясняет отсутствие браузерной поддержки", async ({ page }) => {
    // Детерминированное состояние «браузер без push» на всех движках
    await page.addInitScript(() => {
      try {
        delete (window as unknown as { PushManager?: unknown }).PushManager;
      } catch {
        /* noop */
      }
    });
    await page.goto("/admin/login");
    await loginAdminUi(page);
    await expect(page).toHaveURL(/\/admin/);

    await page.getByRole("button", { name: "Установка и уведомления на этом устройстве" }).click();
    const dialog = page.getByRole("dialog", { name: "Установка и уведомления" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/не поддерживает push-уведомления/)).toBeVisible();
    // Зоны касания ≥44px
    const close = dialog.getByRole("button", { name: "Закрыть" });
    expect(await close.boundingBox().then((b) => b?.height ?? 0)).toBeGreaterThanOrEqual(44);
  });

  test("включение и выключение уведомлений на устройстве (мок PushManager)", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "мок PushManager стабилен только в Chromium");
    await page.addInitScript(() => {
      // Headless Chromium не умеет grants уведомлений — фиксируем разрешение
      class FakeNotification {
        static permission = "granted";
      }
      Object.defineProperty(window, "Notification", { value: FakeNotification, configurable: true });
      const subscription = {
        endpoint: "https://push.test/e2e-device",
        toJSON: () => ({ endpoint: "https://push.test/e2e-device", keys: { p256dh: "key-p", auth: "key-a" } }),
        unsubscribe: async () => true,
      };
      const registration = {
        scope: "/admin/",
        pushManager: {
          getSubscription: async () => (window as unknown as { __subscribed: boolean }).__subscribed ? subscription : null,
          subscribe: async () => {
            (window as unknown as { __subscribed: boolean }).__subscribed = true;
            return subscription;
          },
        },
      };
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: { register: async () => registration, ready: Promise.resolve(registration) },
      });
    });

    await page.goto("/admin/login");
    await loginAdminUi(page);
    await expect(page).toHaveURL(/\/admin/);

    await page.getByRole("button", { name: "Установка и уведомления на этом устройстве" }).click();
    const dialog = page.getByRole("dialog", { name: "Установка и уведомления" });

    await dialog.getByRole("button", { name: "Включить уведомления" }).click();
    await expect(dialog.getByText("Уведомления включены на этом устройстве.").first()).toBeVisible({ timeout: 15_000 });

    await dialog.getByRole("button", { name: "Выключить" }).click();
    await expect(dialog.getByRole("button", { name: "Включить уведомления" })).toBeVisible({ timeout: 15_000 });
  });
});
