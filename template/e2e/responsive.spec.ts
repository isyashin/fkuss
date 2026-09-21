import { test, expect } from "@playwright/test";

test("public pages fit the viewport and controls remain touch accessible", async ({ page }) => {
  for (const path of ["/", "/booking"]) {
    await page.goto(path);
    await expect.poll(() => page.evaluate(() => document.readyState)).toBe("complete");
    const layout = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
      controls: [...document.querySelectorAll("button, input, select, textarea")]
        .filter((element) => {
          const style = getComputedStyle(element);
          return style.display !== "none" && style.visibility !== "hidden";
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        }),
    }));
    expect(layout.content, `${path} has horizontal overflow`).toBeLessThanOrEqual(layout.viewport + 1);
    for (const control of layout.controls) {
      expect(control.width, `${path} control is narrower than 44px`).toBeGreaterThanOrEqual(44);
      expect(control.height, `${path} control is shorter than 44px`).toBeGreaterThanOrEqual(44);
    }
  }
});
