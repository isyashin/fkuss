import { test, expect } from "@playwright/test";

// Инвариант карточки блюда: фото увеличено (scale), но строго обрезано
// квадратной обёрткой. Поломка обрезки = фото «вылезает» за карточку —
// регресс ловим здесь, а не глазами на проде.
test("карточка блюда: фото зумится и обрезается обёрткой", async ({ page }) => {
  await page.goto("/menu");
  const card = page.getByTestId("dish-card").first();
  await expect(card).toBeVisible();
  const wrap = card.locator(".aspect-square");
  const img = wrap.locator("img");

  const wrapBox = (await wrap.boundingBox())!;
  const imgBox = (await img.boundingBox())!;
  const wrapStyle = await wrap.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { overflow: cs.overflow, aspectRatio: cs.aspectRatio };
  });

  expect(wrapStyle.overflow).toBe("hidden");
  expect(wrapStyle.aspectRatio).toBe("1 / 1");
  // зум применён: фото визуально больше обёртки (иначе scale потерян)
  expect(imgBox!.height).toBeGreaterThan(wrapBox!.height + 10);
  // обрезка работает: нижняя граница обёртки выше нижней границы фото,
  // а видимый низ обёртки не перекрыт фото (overflow: hidden проверен выше)
  expect(imgBox!.y + imgBox!.height).toBeGreaterThan(wrapBox!.y + wrapBox!.height);
});
