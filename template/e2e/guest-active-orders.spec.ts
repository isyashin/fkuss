import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";

const pool=new Pool({connectionString:process.env.DATABASE_URL});
const created=new Set<string>();
const options=new Set<string>();
test.use({serviceWorkers:"block"});
test.afterAll(async()=>{await pool.end();});
test.afterEach(async()=>{
  for(const id of options) await pool.query('DELETE FROM "DeliveryOption" WHERE id=$1',[id]);options.clear();
  const ids=[...created];created.clear();if(!ids.length)return;
  await pool.query('DELETE FROM "AdminEvent" WHERE reference=ANY($1::text[])',[ids]);
  await pool.query('DELETE FROM "BonusTransaction" WHERE "orderId"=ANY($1::text[])',[ids]);
  await pool.query('DELETE FROM "OrderItem" WHERE "orderId"=ANY($1::text[])',[ids]);
  await pool.query('DELETE FROM "Order" WHERE id=ANY($1::text[])',[ids]);
});
test.beforeEach(async({page},info)=>{
  const project=info.project.name==="desktop"?142:info.project.name==="webkit-mobile"?143:141;
  await page.setExtraHTTPHeaders({"x-forwarded-for":`10.99.${project}.${info.title.length}`});
});
async function add(page:Page,second=false) {
  if(second) await page.getByTestId("menu-switch").getByRole("tab",{name:"Тестовое меню 2"}).click();
  await page.getByTestId("dish-card").first().click();
  await page.getByRole("button",{name:/Добавить ·/}).click();
}
async function submitUi(page:Page) {
  await page.getByRole("button",{name:/Корзина ·/}).click();
  await page.getByRole("button",{name:/Оформить ·/}).click();
  await page.getByRole("button",{name:"Самовывоз",exact:true}).click();
  await page.getByLabel("Имя",{exact:true}).fill("QA Tracking E2E");
  await page.getByLabel("Телефон",{exact:true}).fill("+79990001133");
  const response=page.waitForResponse(r=>r.url().endsWith("/api/order")&&r.request().method()==="POST");
  await page.getByRole("button",{name:/Заказать ·/}).click();
  const data=await(await response).json();created.add(data.order.id);
  await expect(page.getByRole("heading",{name:/Заказ №\d+ принят/})).toBeVisible();
  return data.order as {id:string;number:number;total:number};
}
async function apiOrder(page:Page,patch:Record<string,unknown>={}) {
  const dish=(await pool.query('SELECT id FROM "Dish" WHERE available=true ORDER BY price DESC,id LIMIT 1')).rows[0].id;
  if(patch.type==="delivery") {
    const id=crypto.randomUUID();options.add(id);
    await pool.query('INSERT INTO "DeliveryOption" (id,name,mode,days,"hoursFrom","hoursTo","daysAhead","minAheadMinutes",price,position,exceptions) VALUES ($1,\'Tracking delivery\',\'scheduled\',ARRAY[0,1,2,3,4,5,6],\'00:00\',\'23:59\',7,0,150,0,ARRAY[]::text[])',[id]);
    const slots=await(await page.request.get("/api/delivery/slots")).json();
    const windows=slots.options.find((o:{id:string})=>o.id===id).windows;const window=windows.at(-1);
    patch={...patch,deliveryOptionId:id,deliveryMode:"scheduled",deliveryDate:window.date,deliverySlotStart:window.start,deliverySlotEnd:window.end};
  }
  const result=await page.evaluate(async({dish,patch})=>{
    const init=await fetch("/api/order/session",{method:"POST"});if(!init.ok)throw new Error("session "+init.status);
    const response=await fetch("/api/order",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":crypto.randomUUID()},body:JSON.stringify({items:[{dishId:dish,quantity:3}],type:"pickup",customerName:"QA Tracking E2E",customerPhone:"+79990001133",preferredChannel:"phone",...patch})});
    return {status:response.status,data:await response.json()};
  },{dish,patch});
  expect(result.status,JSON.stringify(result.data)).toBe(200);created.add(result.data.order.id);
  await refresh(page);return result.data.order as {id:string;number:number;total:number};
}
async function refresh(page:Page) { await page.evaluate(()=>window.dispatchEvent(new Event("focus"))); }
async function status(page:Page,id:string,value:string,label:string) {
  await pool.query('UPDATE "Order" SET status=$2,"updatedAt"=now() WHERE id=$1',[id,value]);
  await expect.poll(async()=>{await refresh(page);return page.getByTestId("guest-order-dock").innerText();},{timeout:15000}).toContain(label);
}

test("mixed menus, historical items and modifiers survive reload; ready pickup remains until issued",async({page},info)=>{
  await page.goto("/menu");
  await page.getByRole("button",{name:/Хачапури по-аджарски/}).click();
  await page.getByLabel(/Двойной сыр/).check();await page.getByRole("button",{name:/Добавить ·/}).click();
  await add(page,true);const order=await submitUi(page);
  await expect(page.getByTestId("guest-order-dock")).toContainText(`Заказ №${order.number}`);
  await page.reload();await page.getByTestId("guest-order-dock").getByRole("button").first().click();
  const dialog=page.getByRole("dialog");await expect(dialog.getByText("Двойной сыр")).toBeVisible();
  await expect(dialog.getByText("Блюдо второй группы",{exact:false})).toBeVisible();
  await expect(dialog.getByText("Тестовое меню 2",{exact:true})).toBeVisible();
  const geometry=await dialog.evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,viewport:innerWidth,overflow:el.scrollWidth>el.clientWidth+1};});
  expect(geometry.x).toBeGreaterThanOrEqual(0);expect(geometry.width).toBeLessThanOrEqual(geometry.viewport);expect(geometry.overflow).toBe(false);
  await page.screenshot({path:info.outputPath("active-order.png")});
  for(const button of await dialog.getByRole("button").all()) {const r=await button.boundingBox();if(r)expect(r.height).toBeGreaterThanOrEqual(44);}
  await page.getByRole("button",{name:"Закрыть заказ"}).click();
  await status(page,order.id,"ready","Можно забирать");await page.waitForTimeout(5500);
  await expect(page.getByTestId("guest-order-dock")).toBeVisible();
  await status(page,order.id,"issued","Выдан");
  await expect(page.getByTestId("guest-order-dock")).toHaveCount(0,{timeout:10000});
  await page.reload();await expect(page.getByTestId("guest-order-dock")).toHaveCount(0);
});

test("delivery ready and courier stages remain active; delivery completion clears only this order",async({page})=>{
  await page.goto("/menu");const order=await apiOrder(page,{type:"delivery",address:"Тестов, Тестовая, 1",addressCity:"Тестов",addressStreet:"Тестовая",addressHouse:"1",zoneName:"Центр"});
  await status(page,order.id,"ready","Готов к доставке");await page.waitForTimeout(5200);await expect(page.getByTestId("guest-order-dock")).toBeVisible();
  await status(page,order.id,"handed_to_courier","Курьер в пути");
  await status(page,order.id,"delivered","Доставлен");await expect(page.getByTestId("guest-order-dock")).toHaveCount(0,{timeout:10000});
});

test("new draft survives cancellation, navigation and two tabs",async({page,context})=>{
  await page.goto("/menu");const order=await apiOrder(page);
  const tab=await context.newPage();await tab.goto("/menu");await expect(tab.getByTestId("guest-order-dock")).toBeVisible();
  await add(page);await expect(page.getByRole("button",{name:/Корзина · 1/})).toBeVisible();
  await page.goto("/booking");await expect(page.getByTestId("guest-order-dock")).toBeVisible();
  await page.getByRole("button",{name:/Корзина · 1/}).click();await expect(page.getByRole("heading",{name:"Корзина",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Закрыть",exact:true}).last().click();
  await status(page,order.id,"cancelled","Отменён");
  await expect(page.getByTestId("guest-order-dock")).toHaveCount(0,{timeout:10000});
  await expect(page.getByRole("button",{name:/Корзина · 1/})).toBeVisible();
  await refresh(tab);await expect(tab.getByTestId("guest-order-dock")).toHaveCount(0,{timeout:10000});await tab.close();
});

test("multiple active orders open a list and completing one preserves the other",async({page})=>{
  await page.goto("/menu");const first=await apiOrder(page);const second=await apiOrder(page);
  const dock=page.getByTestId("guest-order-dock");await expect(dock).toContainText("Ваши заказы · 2");await dock.getByRole("button").click();
  await page.getByRole("dialog").getByRole("button",{name:new RegExp(`№${first.number}`)}).click();
  await expect(page.getByRole("dialog").getByRole("heading")).toHaveText(`Заказ №${first.number}`);
  await page.goBack();await expect(page.getByRole("dialog")).not.toBeVisible();
  await pool.query('UPDATE "Order" SET status=\'cancelled\',"updatedAt"=now() WHERE id=$1',[first.id]);await refresh(page);
  await expect(dock).toContainText(`Заказ №${second.number}`,{timeout:10000});
});

test("offline and server errors preserve the last status; recovery refreshes it",async({page,context})=>{
  await page.goto("/menu");const order=await apiOrder(page);const dock=page.getByTestId("guest-order-dock");
  await expect(dock).toBeVisible();await context.setOffline(true);
  await expect.poll(async()=>{await refresh(page);return dock.innerText();},{timeout:20000}).toContain("Нет связи");
  await pool.query('UPDATE "Order" SET status=\'ready\',"updatedAt"=now() WHERE id=$1',[order.id]);
  await expect(dock).toContainText("Ждёт подтверждения");await context.setOffline(false);await refresh(page);
  await expect(dock).toContainText("Можно забирать",{timeout:10000});
  await page.route("**/api/order/active?*",route=>route.fulfill({status:503,body:"{}"}));
  await expect.poll(async()=>{await refresh(page);return dock.innerText();},{timeout:20000}).toContain("Нет связи");await expect(dock).toContainText("Можно забирать");
  await page.unroute("**/api/order/active?*");await refresh(page);await expect(dock).not.toContainText("Нет связи",{timeout:10000});
});

test("a lost POST response is recovered without a second order or losing its draft acknowledgement",async({page})=>{
  await page.goto("/menu");await add(page);
  let originalId="",seen=false;
  await page.route("**/api/order",async route=>{
    if(route.request().method()!=="POST"||seen){await route.continue();return;}seen=true;
    const response=await route.fetch();const data=await response.json();originalId=data.order.id;created.add(originalId);await route.abort("failed");
  });
  await page.getByRole("button",{name:/Корзина ·/}).click();await page.getByRole("button",{name:/Оформить ·/}).click();await page.getByRole("button",{name:"Самовывоз",exact:true}).click();
  await page.getByLabel("Имя",{exact:true}).fill("QA Tracking E2E");await page.getByLabel("Телефон",{exact:true}).fill("+79990001133");
  await page.getByRole("button",{name:/Заказать ·/}).click();await expect(page.getByText("Нет связи. Попробуйте ещё раз.",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:/Заказать ·/}).click();await expect(page.getByRole("heading",{name:/Заказ №\d+ принят/})).toBeVisible();
  expect((await pool.query('SELECT count(*)::int n FROM "GuestCheckout" WHERE "orderId"=$1',[originalId])).rows[0].n).toBe(1);
  await expect(page.getByTestId("guest-order-dock")).toBeVisible();
  const persisted=await page.evaluate(()=>({cart:JSON.parse(localStorage.getItem("resto-cart")!).state,active:localStorage.getItem("resto-active-orders")!}));
  expect(persisted.cart.items).toHaveLength(0);expect(persisted.active).not.toContain("customerPhone");expect(persisted.active).not.toContain("confirmationUrl");
});

test("a late checkout response cannot empty a new draft or close its editor",async({page})=>{
  await page.goto("/menu");await add(page);
  let release=()=>{};const held=new Promise<void>(resolve=>{release=resolve;});let committed=false;
  await page.route("**/api/order",async route=>{
    if(route.request().method()!=="POST"){await route.continue();return;}
    const response=await route.fetch();const data=await response.json();created.add(data.order.id);committed=true;
    await held;await route.fulfill({response});
  });
  try {
    await page.getByRole("button",{name:/Корзина ·/}).click();await page.getByRole("button",{name:/Оформить ·/}).click();
    await page.getByRole("button",{name:"Самовывоз",exact:true}).click();await page.getByLabel("Имя",{exact:true}).fill("QA Tracking E2E");await page.getByLabel("Телефон",{exact:true}).fill("+79990001133");
    await page.getByRole("button",{name:/Заказать ·/}).click();await expect.poll(()=>committed).toBe(true);
    await page.getByRole("button",{name:"Закрыть",exact:true}).last().click();await add(page,true);
    await page.getByRole("button",{name:/Корзина · 1/}).click();
    release();await expect(page.getByRole("heading",{name:"Корзина",exact:true})).toBeVisible();
    await expect(page.getByRole("dialog").getByText("Блюдо второй группы",{exact:true})).toBeVisible();
    await expect.poll(async()=>page.evaluate(()=>JSON.parse(localStorage.getItem("resto-cart")!).state.pending.length)).toBe(0);
    const items=await page.evaluate(()=>JSON.parse(localStorage.getItem("resto-cart")!).state.items);
    expect(items).toHaveLength(1);expect(items[0].dishId).toBe("dish-e2e-second");
  } finally {release();}
});

test("online payment navigation preserves the order and paid still remains active",async({page})=>{
  const saved=(await pool.query('SELECT value FROM "Settings" WHERE key=\'settings\'')).rows[0].value;
  let data:{order:{id:string};orderNumber:number}|null=null;
  await page.route("**/api/order",async route=>{
    const response=await route.fetch();data=await response.json();if(data)created.add(data.order.id);
    await route.fulfill({response});
  });
  try {
    await page.goto("/menu");const origin=new URL(page.url()).origin;
    await pool.query('UPDATE "Settings" SET value=jsonb_set(jsonb_set(value,\'{payment,provider}\',\'"mock"\'),\'{domains,canonical}\',$1::jsonb) WHERE key=\'settings\'',[JSON.stringify(origin)]);
    await page.reload();await add(page);
    await page.getByRole("button",{name:/Корзина ·/}).click();await page.getByRole("button",{name:/Оформить ·/}).click();await page.getByRole("button",{name:"Самовывоз",exact:true}).click();
    await page.getByLabel("Имя",{exact:true}).fill("QA Tracking E2E");await page.getByLabel("Телефон",{exact:true}).fill("+79990001133");
    await page.getByRole("button",{name:"Картой онлайн",exact:true}).click();
    await page.getByRole("button",{name:/Оплатить ·/}).click();
    await expect(page.getByRole("heading",{name:/Заказ №\d+ оплачен/})).toBeVisible({timeout:15000});
    expect(data).not.toBeNull();
    await page.goto("/menu");const dock=page.getByTestId("guest-order-dock");await expect(dock).toContainText(`Заказ №${data!.orderNumber}`);
    await dock.getByRole("button").click();await expect(page.getByRole("dialog").getByText("Оплачен",{exact:true})).toBeVisible();
    await expect(page.getByRole("link",{name:/Перейти к оплате/})).toHaveCount(0);
    const cart=await page.evaluate(()=>JSON.parse(localStorage.getItem("resto-cart")!).state.items);expect(cart).toHaveLength(0);
  } finally { await pool.query('UPDATE "Settings" SET value=$1::jsonb WHERE key=\'settings\'',[JSON.stringify(saved)]); }
});

test("anonymous credentials stay HttpOnly, another browser cannot read the order, logout revokes access",async({page,browser})=>{
  await page.goto("/menu");const order=await apiOrder(page);
  const cookie=(await page.context().cookies()).find(c=>c.name==="resto_guest_orders")!;expect(cookie.httpOnly).toBe(true);expect(cookie.path).toBe("/");
  const other=await browser.newContext();const foreign=await other.request.get(new URL(`/api/order/active/${order.id}`,page.url()).href);expect(foreign.status()).toBe(404);await other.close();
  const result=await page.evaluate(async id=>{
    const before=await fetch(`/api/order/active/${id}`);await fetch("/api/auth/logout",{method:"POST"});window.dispatchEvent(new Event("fkuss-guest-logout"));
    return{cache:before.headers.get("cache-control"),status:(await fetch(`/api/order/active/${id}`)).status,cookie:document.cookie};
  },order.id);
  expect(result.cache).toContain("no-store");expect(result.status).toBe(404);expect(result.cookie).not.toContain("resto_guest_orders");await expect(page.getByTestId("guest-order-dock")).toHaveCount(0);
});

test.describe("installed storefront service worker",()=>{
  test.use({serviceWorkers:"allow"});
  test("tracking JSON never enters CacheStorage",async({page})=>{
    await page.goto("/menu");await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
    const order=await apiOrder(page);
    const result=await page.evaluate(async id=>{
      const list=await fetch("/api/order/active");await list.text();
      const detail=await fetch(`/api/order/active/${id}`);await detail.text();
      const paths=(await Promise.all((await caches.keys()).map(async key=>(await(await caches.open(key)).keys()).map(r=>new URL(r.url).pathname)))).flat();
      return{list:list.headers.get("cache-control"),detail:detail.headers.get("cache-control"),paths};
    },order.id);
    expect(result.list).toContain("no-store");expect(result.detail).toContain("no-store");expect(result.paths.filter(p=>p.startsWith("/api/order"))).toEqual([]);
  });
});
