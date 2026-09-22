import { test, expect, type Page } from "@playwright/test";

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
      controls: [...document.querySelectorAll("button, input, select, textarea")]
        .filter((element) => {
          const style = getComputedStyle(element);
          const type = element.getAttribute("type");
          return style.display !== "none" && style.visibility !== "hidden" && type !== "checkbox" && type !== "radio";
        })
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        }),
      touchLinks: [...document.querySelectorAll('a[href]')]
        .filter((element) => {
          const style = getComputedStyle(element);
          return style.display !== "none" && style.visibility !== "hidden" && /min-h-(?:11|12|\[44px\])/.test(element.className);
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
    for (const link of layout.touchLinks) {
      expect(link.width, `${path} touch link is narrower than 44px`).toBeGreaterThanOrEqual(44);
      expect(link.height, `${path} touch link is shorter than 44px`).toBeGreaterThanOrEqual(44);
    }
    expect(brokenAssets, `${path} has broken content assets`).toEqual([]);
  } finally {
    page.off("response", onResponse);
  }
}

test("owner cabinet and platform admin login fit the viewport", async ({ page }) => {
  await assertResponsivePage(page, "/cabinet");
  await assertResponsivePage(page, "/admin/login");
});
