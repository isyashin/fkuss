import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

test("menu cards: mixed titles, absent weight and loading/error photos keep rows aligned", async ({ page }) => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const category = `layout-${randomUUID()}`;
  const ids = Array.from({ length: 6 }, (_, i) => `${category}-${i}`);
  try {
    const { rows } = await pool.query<{ image: string }>('SELECT image FROM "Dish" WHERE available AND image <> \'\' ORDER BY id LIMIT 1');
    expect(rows).toHaveLength(1);
    await pool.query('INSERT INTO "Category" (id, name, position) VALUES ($1, $2, -1000)', [category, "Проверка выравнивания"]);
    const names = ["Суп", "Домашний чебурек с сыром, свежей зеленью и овощами", "Чай", "Большая порция домашней выпечки со свежими овощами", "Сок", "Лимонад с мятой"];
    for (const [i, id] of ids.entries()) {
      await pool.query('INSERT INTO "Dish" (id, "categoryId", name, price, image, weight, position, tags) VALUES ($1,$2,$3,100,$4,$5,$6,ARRAY[]::text[])', [id, category, names[i], i === 3 ? "" : i === 4 ? `images/dishes/${category}.webp` : rows[0].image, i === 2 || i === 4 ? "" : "150 г", i]);
    }

    // Hold the real photos: frame geometry must be correct even before loading.
    let release!: () => void;
    const ready = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/content-asset/images/dishes/**", async (route) => { await ready; await route.continue(); });
    await page.goto("/menu", { waitUntil: "domcontentloaded" });
    const cards = page.locator(`#cat-${category} [data-testid="dish-card"]`);
    await expect(cards).toHaveCount(6);

    const geometry = () => cards.evaluateAll((elements) => {
      const rect = (el: Element) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
      const rows = elements.map((el) => ({ card: rect(el), photo: rect(el.children[0]), footer: rect(el.children[1].lastElementChild!) }));
      return {
        topGap: Math.max(...rows.map((r) => Math.abs(r.photo.top - r.card.top))),
        squareError: Math.max(...rows.map((r) => Math.abs(r.photo.width - r.photo.height))),
        rowError: Math.max(0, ...rows.flatMap((r, i) => rows.slice(i + 1).filter((n) => Math.abs(n.card.top - r.card.top) < 1).flatMap((n) => [Math.abs(n.photo.top - r.photo.top), Math.abs(n.footer.top - r.footer.top), Math.abs(n.card.bottom - r.card.bottom)]))),
        minTouch: Math.min(...elements.map((el) => rect(el.children[1].lastElementChild!.lastElementChild!).height)),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    const aligned = async () => { const g = await geometry(); return g.topGap <= 1 && g.squareError <= 1 && g.rowError <= 1 && g.minTouch >= 44 && g.overflow <= 1; };
    try {
      await expect.poll(aligned).toBe(true);
    } finally { release(); }

    await expect(cards.nth(3).getByRole("img", { name: "Фото отсутствует", exact: true })).toBeVisible();
    await cards.nth(4).scrollIntoViewIfNeeded();
    await expect(cards.nth(4).getByRole("img", { name: "Фото отсутствует", exact: true })).toBeVisible();
    await expect.poll(aligned).toBe(true);
  } finally {
    await pool.query('DELETE FROM "Dish" WHERE id = ANY($1::text[])', [ids]);
    await pool.query('DELETE FROM "Category" WHERE id = $1', [category]);
    await pool.end();
  }
});

test("sticky menu: both rows stay below the header and category headings remain visible after resize", async ({ page }) => {
  await page.goto("/menu");
  const menus = page.getByTestId("menu-switch");
  const tabs = page.getByTestId("menu-tabs");
  await expect(menus).toBeVisible();
  await expect(tabs.getByRole("tab").nth(1)).toBeVisible();

  // Simulate a long menu regardless of the small demo seed.
  await page.locator('section[id^="cat-"]').last().evaluate((el) => { (el as HTMLElement).style.paddingBottom = "1200px"; });
  for (const fontSize of ["16px", "20px"]) {
    await page.evaluate((size) => { document.documentElement.style.fontSize = size; const row = document.querySelector('[data-testid="menu-switch"]')!; window.scrollTo(0, scrollY + row.getBoundingClientRect().top + 300); }, fontSize);
    const nonOverlapping = async () => {
      const header = await page.locator("header").boundingBox();
      const group = await menus.locator("..").boundingBox();
      const categories = await tabs.locator("..").boundingBox();
      return !!header && !!group && !!categories && Math.abs(group.y - (header.y + header.height)) <= 1 && categories.y >= group.y + group.height - 1;
    };
    await expect.poll(nonOverlapping).toBe(true);
    const target = tabs.getByRole("tab").nth(1);
    const categoryName = await target.innerText();
    await target.click();
    await expect(target).toHaveAttribute("aria-selected", "true");
    const heading = page.getByRole("heading", { name: categoryName, exact: true });
    await expect.poll(async () => {
      const a = await heading.boundingBox();
      const b = await tabs.boundingBox();
      return a && b ? a.y - (b.y + b.height) : -999;
    }).toBeGreaterThanOrEqual(0);
    await expect.poll(async () => (await heading.boundingBox())!.y).toBeLessThan((page.viewportSize()?.height ?? 800) / 2);
  }
});
