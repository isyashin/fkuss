import { test, expect } from "@playwright/test";

// Табы категорий на витрине: ряд длиннее экрана и должен листаться
// драгом мышью, вертикальным колесом и тач-свайпом (на мобильном).
test("табы категорий листаются мышью и колесом", async ({ page }) => {
  await page.goto("/#menu");
  const tabs = page.getByTestId("menu-tabs");
  await expect(tabs).toBeVisible();
  const overflows = await tabs.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(overflows).toBe(true);

  // 1) драг мышью двигает ряд
  const box = (await tabs.boundingBox())!;
  const midY = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width - 30, midY);
  await page.mouse.down();
  await page.mouse.move(box.x + 30, midY, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => tabs.evaluate((el) => el.scrollLeft), { timeout: 5000 }).toBeGreaterThan(10);

  // 2) вертикальное колесо над табами листает ряд по горизонтали
  await page.mouse.move(box.x + box.width / 2, midY);
  await page.mouse.wheel(0, 200);
  await expect.poll(async () => tabs.evaluate((el) => el.scrollLeft), { timeout: 5000 }).toBeGreaterThan(50);

  // 3) обычный клик после прокрутки работает: «Соусы» в самом конце ряда
  await tabs.getByRole("tab", { name: "Соусы" }).click();
  await expect(page.getByRole("heading", { name: "Соусы" })).toBeInViewport();

  // 4) драг НЕ выбирает категорию: тянем от «Холодные закуски» — активная не меняется
  const first = tabs.getByRole("tab", { name: "Холодные закуски" });
  const firstBox = (await first.boundingBox())!;
  await page.mouse.move(firstBox.x + 20, firstBox.y + firstBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(firstBox.x + 140, firstBox.y + firstBox.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  await expect(first).toHaveAttribute("data-active", "true");
});

test("табы категорий листаются свайпом на тач-устройстве", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile-360", "тач-свайп проверяем в chromium-проекте");
  await page.goto("/#menu");
  const tabs = page.getByTestId("menu-tabs");
  await expect(tabs).toBeVisible();
  const overflows = await tabs.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(overflows).toBe(true);

  const box = (await tabs.boundingBox())!;
  const cx = Math.round(box.x + box.width / 2);
  const cy = Math.round(box.y + box.height / 2);
  const cdp = await context.newCDPSession(page);
  const swipe = (type: "touchStart" | "touchMove" | "touchEnd", x: number) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: [{ x, y: cy, id: 1 }] });

  await swipe("touchStart", cx);
  for (let i = 1; i <= 5; i++) await swipe("touchMove", cx - i * 28);
  await swipe("touchEnd", cx - 140);
  await expect.poll(async () => tabs.evaluate((el) => el.scrollLeft), { timeout: 5000 }).toBeGreaterThan(10);
});
