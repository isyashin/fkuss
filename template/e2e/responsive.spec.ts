import { test, expect, type Page } from "@playwright/test";
import { loginAdminUi } from "./login-admin";

async function assertResponsivePage(page: Page, path: string) {
  const brokenAssets: string[] = [];
  const onResponse = (response: { url: () => string; status: () => number }) => {
    const pathname = new URL(response.url()).pathname;
    if (pathname.startsWith("/content-asset/") && response.status() >= 400) {
      brokenAssets.push(`${response.status()} ${pathname}`);
    }
  };

  page.on("response", onResponse);
  try {
    await page.goto(path);
    await expect.poll(() => page.evaluate(() => document.readyState)).toBe("complete");
    const layout = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
      controls: [...document.querySelectorAll("button, input:not([type='hidden']), select, textarea")]
        .filter((element) => {
          const style = getComputedStyle(element);
          return style.display !== "none" && style.visibility !== "hidden";
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { width: rect.width, height: rect.height, kind: `${element.tagName.toLowerCase()}.${String(element.className)}` };
        })
        .filter((element) => element.width > 0 && element.height > 0),
      touchLinks: [...document.querySelectorAll('a[href]')]
        .filter((element) => {
          const style = getComputedStyle(element);
          return (
            style.display !== "none" &&
            style.visibility !== "hidden" &&
            /min-h-(?:11|12|\[44px\])/.test(element.className)
          );
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { width: rect.width, height: rect.height, kind: `${element.tagName.toLowerCase()}.${String(element.className)}` };
        })
        .filter((element) => element.width > 0 && element.height > 0),
    }));
    expect(layout.content, `${path} has horizontal overflow`).toBeLessThanOrEqual(layout.viewport + 1);
    for (const control of layout.controls) {
      expect(control.width, `${path} ${control.kind} control is narrower than 44px`).toBeGreaterThanOrEqual(44);
      expect(control.height, `${path} ${control.kind} control is shorter than 44px`).toBeGreaterThanOrEqual(44);
    }
    for (const link of layout.touchLinks) {
      expect(link.width, `${path} ${link.kind} touch link is narrower than 44px`).toBeGreaterThanOrEqual(44);
      expect(link.height, `${path} ${link.kind} touch link is shorter than 44px`).toBeGreaterThanOrEqual(44);
    }
    expect(brokenAssets, `${path} has broken content assets`).toEqual([]);
  } finally {
    page.off("response", onResponse);
  }
}

test("public pages fit the viewport and content assets load", async ({ page }) => {
  for (const path of ["/", "/booking", "/account"]) {
    await assertResponsivePage(page, path);
  }
});

test("admin login, dashboard and bookings fit the viewport", async ({ page }) => {
  await assertResponsivePage(page, "/admin/login");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);
  await assertResponsivePage(page, "/admin");
  const brand = page.locator('aside[aria-label="Панель ресторана"] a[href="/admin"]');
  const restaurantName = await brand.locator("strong").textContent();
  await brand.locator("img").evaluate((image) => image.dispatchEvent(new Event("error")));
  await expect(brand.locator("span").first()).toHaveText(restaurantName?.slice(0, 1) ?? "");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/admin/bookings");
  await expect(page.getByRole("heading", { name: "Предстоящие" })).toBeVisible();

  const list = await page.getByRole("region", { name: "Список броней" }).boundingBox();
  const detail = await page.getByRole("region", { name: "Детали брони" }).boundingBox();
  expect(list).not.toBeNull();
  expect(detail).not.toBeNull();
  expect(detail!.x).toBeGreaterThan(list!.x + list!.width);
  expect(detail!.y).toBeCloseTo(list!.y, 0);
  expect(list!.x).toBeLessThanOrEqual(264);
  expect(detail!.x + detail!.width).toBeGreaterThanOrEqual(1248);
  const bookingFonts = await page.evaluate(() => ({
    list: getComputedStyle(document.querySelector('section[aria-label="Список броней"] h2')!).fontFamily,
    detail: getComputedStyle(document.querySelector('section[aria-label="Детали брони"] h2')!).fontFamily,
  }));
  expect(bookingFonts.list).toContain("Arial");
  expect(bookingFonts.detail).toContain("Arial");
  const contactLinks = page.getByRole("region", { name: "Детали брони" }).getByRole("link", { name: /WhatsApp|Telegram/ });
  if (await contactLinks.count() === 2) {
    const first = await contactLinks.nth(0).boundingBox();
    const second = await contactLinks.nth(1).boundingBox();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second!.y).toBeCloseTo(first!.y, 0);
  }

  await page.getByText("Все брони и фильтры").click();
  await expect(page.getByRole("group", { name: "Фильтр броней" })).toBeVisible();
  await page.setViewportSize({ width: 360, height: 800 });
  const mobile = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  expect(mobile.content, "admin bookings overflow on mobile").toBeLessThanOrEqual(mobile.viewport + 1);
  const themeButton = page.getByRole("button", { name: "Включить тёмную тему" });
  await expect(themeButton.getByText("Светлая")).toBeVisible();
  await expect(themeButton.locator("svg")).toBeVisible();
  const mobileNav = page.getByRole("navigation", { name: "Мобильная навигация" });
  for (const href of ["/admin", "/admin/bookings"]) {
    const sidebarCount = page.locator(`aside[aria-label="Панель ресторана"] a[href="${href}"] em`);
    if (await sidebarCount.count()) {
      await expect(mobileNav.locator(`a[href="${href}"] em`)).toHaveText(await sidebarCount.textContent() ?? "");
    }
  }

  await page.goto("/admin/menu");
  await expect(page.getByRole("heading", { name: "Меню", exact: true })).toBeVisible();
  const categoryGroup = page.getByRole("group", { name: "Категории меню" });
  await expect(categoryGroup).toBeVisible();
  expect(await categoryGroup.evaluate((element) => getComputedStyle(element).flexWrap)).toBe("wrap");
  const firstDish = page.getByRole("article").first();
  await expect(firstDish.getByRole("heading", { level: 3 })).toBeVisible();
  await expect(firstDish.getByRole("button", { name: /фото блюда/ })).toBeVisible();
  await expect(firstDish.locator("p").first()).toBeVisible();
  await firstDish.getByRole("button", { name: "Править" }).click();
  await expect(firstDish.getByLabel("Описание")).toBeVisible();
  await firstDish.getByLabel("Режим цены").selectOption("inherit");
  await expect(firstDish.getByLabel("Цена на витрине, ₽")).toBeVisible();
  await firstDish.getByRole("button", { name: "Отмена" }).click();
  await page.getByRole("button", { name: "+ Блюдо" }).first().click();
  await expect(page.getByRole("heading", { name: /Новое блюдо/ })).toBeVisible();
  await page.getByRole("button", { name: "Отмена" }).click();
  const menuWidth = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  expect(menuWidth.content, "admin menu overflows on mobile").toBeLessThanOrEqual(menuWidth.viewport + 1);

  await page.goto("/admin/settings");
  await expect(page.getByRole("region", { name: "Внешний вид панели" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Звук уведомления" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Профиль администратора" })).toBeVisible();
  for (const section of ["restaurant", "site-theme", "delivery", "pricing", "guest-contact", "channels", "booking", "promos", "gallery", "banquets", "pages", "sync", "print-materials", "billing", "team"]) {
    await expect(page.locator(`section#${section}`)).toBeAttached();
  }
  await expect(page.locator("section#delivery").getByRole("button", { name: "Сохранить" })).toBeVisible();
  const settingsWidth = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll("body *")].filter((element) => element.getBoundingClientRect().right > document.documentElement.clientWidth + 1)
      .slice(0, 8).map((element) => `${element.tagName.toLowerCase()}#${element.id}.${element.className?.toString().split(" ")[0]}:${Math.round(element.getBoundingClientRect().right)}`),
  }));
  expect(settingsWidth.content, `admin settings overflow on mobile: ${settingsWidth.offenders.join(", ")}`).toBeLessThanOrEqual(settingsWidth.viewport + 1);
});

test("admin orders use two readable columns with bookings below at 1280px", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/admin/login");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);

  const orders = await page.getByRole("region", { name: "Список заказов" }).boundingBox();
  const detail = await page.getByRole("region", { name: "Детали заказа" }).boundingBox();
  const bookings = await page.getByRole("region", { name: "Ближайшие брони" }).boundingBox();
  expect(orders).not.toBeNull();
  expect(detail).not.toBeNull();
  expect(bookings).not.toBeNull();
  expect(orders!.width).toBeGreaterThan(430);
  expect(detail!.width).toBeGreaterThan(400);
  expect(detail!.x).toBeGreaterThan(orders!.x + orders!.width);
  expect(bookings!.y).toBeGreaterThanOrEqual(Math.max(orders!.y + orders!.height, detail!.y + detail!.height) - 1);
  expect(bookings!.x).toBeCloseTo(orders!.x, 0);

  await page.setViewportSize({ width: 960, height: 900 });
  const width = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  expect(width.content, "admin orders overflow near the two-column breakpoint").toBeLessThanOrEqual(width.viewport + 1);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/admin/menu");
  const search = await page.getByRole("textbox", { name: "Поиск по меню" }).boundingBox();
  expect(search).not.toBeNull();
  expect(search!.width).toBeGreaterThan(800);
  const dishFont = await page.getByRole("article").first().getByRole("heading", { level: 3 })
    .evaluate((element) => ({ family: getComputedStyle(element).fontFamily, weight: getComputedStyle(element).fontWeight }));
  expect(dishFont.family).toContain("Arial");
  expect(dishFont.weight).toBe("400");
});

test("admin dark theme colors the shell and panels consistently", async ({ page }) => {
  await page.goto("/admin/login");
  await loginAdminUi(page);
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole("button", { name: "Включить тёмную тему" }).click();

  const colors = async () => page.evaluate(() => {
    const shell = document.querySelector("main")?.parentElement?.parentElement;
    const panel = document.querySelector('section[aria-label="Список заказов"]');
    if (!shell || !panel) throw new Error("Admin shell or orders panel is missing");
    return {
      background: getComputedStyle(shell).backgroundColor,
      text: getComputedStyle(shell).color,
      panel: getComputedStyle(panel).backgroundColor,
      panelText: getComputedStyle(panel).color,
    };
  });

  await expect.poll(colors).toEqual({
    background: "rgb(27, 30, 29)",
    text: "rgb(244, 240, 233)",
    panel: "rgb(36, 40, 39)",
    panelText: "rgb(244, 240, 233)",
  });
  await page.reload();
  await expect(page.getByRole("button", { name: "Включить светлую тему" })).toBeVisible();
  await expect.poll(colors).toMatchObject({ background: "rgb(27, 30, 29)", panel: "rgb(36, 40, 39)" });
  await page.goto("/admin/menu");
  const menuColors = await page.getByRole("article").first().evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    text: getComputedStyle(element).color,
  }));
  expect(menuColors).toEqual({ background: "rgb(36, 40, 39)", text: "rgb(244, 240, 233)" });
});
