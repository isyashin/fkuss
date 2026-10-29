import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

test.use({ serviceWorkers: "block" });
let pool: Pool;
let prefix: string;
const groupName = (g: number) => `Первый тап: меню ${g + 1}`;
const categoryName = (g: number, c: number) => `Категория ${g + 1}.${c + 1} с длинным названием`;
test.beforeEach(async () => {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  prefix = `tap-${randomUUID()}`;
  for (let g = 0; g < 2; g++) {
    await pool.query('INSERT INTO "MenuGroup" (id,name,position) VALUES ($1,$2,$3)', [`${prefix}-m${g}`, groupName(g), -2000 + g]);
    for (let c = 0; c < 4; c++) {
      const cat = `${prefix}-${g}-${c}`;
      await pool.query('INSERT INTO "Category" (id,name,position,"menuId") VALUES ($1,$2,$3,$4)', [cat, categoryName(g,c), -2000+g*4+c, `${prefix}-m${g}`]);
      for (let d = 0; d < 8; d++) await pool.query('INSERT INTO "Dish" (id,"categoryId",name,price,image,weight,position,tags) VALUES ($1,$2,$3,100,\'\',\'150 г\',$4,ARRAY[]::text[])', [`${cat}-${d}`,cat,`Блюдо ${d+1}`,d]);
    }
  }
});
test.afterEach(async () => {
  try {
    await pool.query('DELETE FROM "Dish" WHERE id LIKE $1', [prefix+'%']);
    await pool.query('DELETE FROM "Category" WHERE id LIKE $1', [prefix+'%']);
    await pool.query('DELETE FROM "MenuGroup" WHERE id LIKE $1', [prefix+'%']);
  } finally { await pool.end(); }
});

async function aligned(page: Page, g: number, c: number) {
  await expect.poll(() => page.evaluate(id => {
    const section = document.getElementById(id)!;
    const nav = document.querySelector('[data-testid="menu-navigation"]')!;
    const h = section.querySelector('h2')!.getBoundingClientRect();
    const n = nav.getBoundingClientRect();
    return Math.abs(h.top-n.bottom-parseFloat(getComputedStyle(section).paddingTop));
  }, `cat-${prefix}-${g}-${c}`)).toBeLessThanOrEqual(1);
  await expect(page.getByRole('heading',{name:categoryName(g,c),exact:true})).toBeInViewport();
}

test("SSR navigation is disabled while scripts load; the first enabled tap switches and scrolls", async ({ page }, testInfo) => {
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release=resolve; });
  await page.route('**/_next/static/**/*.js', async route => { await blocked; await route.continue(); });
  try {
    await page.goto('/menu',{waitUntil:'commit'});
    const other = page.getByTestId('menu-switch').getByRole('tab',{name:groupName(1),exact:true});
    const category = page.getByTestId('menu-tabs').getByRole('tab').nth(1);
    await expect(other).toBeVisible();
    await expect(other).toBeDisabled();
    await expect(category).toBeDisabled();
    await expect(page.getByTestId('menu-navigation')).toHaveAttribute('aria-busy','true');
    const box=(await other.boundingBox())!;
    if (testInfo.project.name === "webkit-mobile") await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
    else await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
    await expect(other).toHaveAttribute('aria-selected','false');
    release();
    await expect(other).toBeEnabled();
    // No CSS-variable, font, timeout or network-idle wait before this first tap.
    if (testInfo.project.name === "webkit-mobile") await other.tap();
    else await other.click();
    await expect(other).toHaveAttribute('aria-selected','true');
    await expect(page.getByRole('heading',{name:categoryName(1,0),exact:true})).toBeVisible();
    const target = page.getByTestId('menu-tabs').getByRole('tab').nth(2);
    if (testInfo.project.name === "webkit-mobile") await target.tap();
    else await target.click();
    await aligned(page,1,2);
  } finally { release(); }
});

test("switching either menu from a deep category shows its first category", async ({ page }) => {
  await page.goto('/menu');
  const tabs=page.getByTestId('menu-tabs');
  for (const [g,next] of [[0,1],[1,0]]) {
    await tabs.getByRole('tab').nth(2).click();
    await aligned(page,g,2);
    await page.getByTestId('menu-switch').getByRole('tab',{name:groupName(next),exact:true}).click();
    await aligned(page,next,0);
    await expect(tabs.getByRole('tab').first()).toHaveAttribute('aria-selected','true');
  }
});

test("category scroll uses current sticky geometry after font/notice/viewport changes and rapid taps", async ({ page }) => {
  await page.goto('/menu');
  for (const g of [0,1]) {
    await page.getByTestId('menu-switch').getByRole('tab',{name:groupName(g),exact:true}).click();
    await page.evaluate(() => {
      document.documentElement.style.fontSize='20px';
      const nav=document.querySelector('[data-testid="menu-navigation"]')!;
      const notice=document.createElement('div');notice.textContent='Проверка длинного сообщения: ресторан закрыт, доступное время можно выбрать при оформлении заказа.';
      notice.style.cssText='padding:16px;font-size:20px';notice.setAttribute('data-resize-fixture','');nav.prepend(notice);
    });
    const tabs=page.getByTestId('menu-tabs').getByRole('tab');
    await tabs.nth(2).click();
    await aligned(page,g,2);
    await tabs.nth(1).click();
    await tabs.nth(3).click();
    await aligned(page,g,3);
    const viewport=page.viewportSize()!;
    await page.setViewportSize({width:viewport.width===360?390:360,height:800});
    await tabs.nth(1).click();
    await aligned(page,g,1);
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    const selected=tabs.nth(1);
    await expect.poll(()=>selected.evaluate(el=>{
      const r=el.getBoundingClientRect(),p=el.parentElement!.getBoundingClientRect();return r.left>=p.left-1&&r.right<=p.right+1;
    })).toBe(true);
    await page.evaluate(()=>{document.querySelector('[data-resize-fixture]')?.remove();document.documentElement.style.fontSize='16px';});
  }
});

test("reduced motion, late geometry and a manual scroll never fight each other", async ({ page }, testInfo) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/menu');
  await page.getByTestId('menu-tabs').getByRole('tab').nth(2).click();
  await aligned(page,0,2);
  await page.evaluate(()=>{
    document.documentElement.style.fontSize='20px';
    const notice=document.createElement('div');notice.style.cssText='padding:24px;font-size:20px';notice.textContent='Позднее сообщение о доступном времени заказа';
    document.querySelector('[data-testid="menu-navigation"]')!.prepend(notice);
  });
  await aligned(page,0,2);
  const before=await page.evaluate(()=>scrollY);
  await page.mouse.move(8,700);
  if (testInfo.project.name === "webkit-mobile") await page.keyboard.press("PageDown");
  else await page.mouse.wheel(0,200);
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(before+100);
  await page.evaluate(()=>{document.documentElement.style.fontSize='18px';window.dispatchEvent(new Event('resize'));});
  await expect.poll(()=>page.evaluate(id=>{
    const h=document.getElementById(id)!.querySelector('h2')!.getBoundingClientRect();
    const n=document.querySelector('[data-testid="menu-navigation"]')!.getBoundingClientRect();return h.top-n.bottom;
  },`cat-${prefix}-0-2`)).toBeLessThan(-50);
});

