import { test, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { gotoAdmin, loginAdminUi } from "./login-admin";

const pool = new Pool({connectionString:process.env.DATABASE_URL});
test.use({serviceWorkers:"block"});
test.afterAll(async()=>{await pool.end();});
const money=(value:number)=>`${value.toLocaleString("ru-RU")} ₽`;
async function login(page:Page,ip:string) {
  const email=`e2e-account-summary-${crypto.randomUUID()}@example.test`;
  await page.setExtraHTTPHeaders({"x-forwarded-for":ip});
  const response=await page.request.post("/api/auth/request-code",{data:{email},headers:{"x-forwarded-for":ip}});expect(response.ok()).toBe(true);
  const {devCode}=await response.json();expect((await page.request.post("/api/auth/verify",{data:{email,code:devCode}})).ok()).toBe(true);
  return {email,id:(await pool.query('SELECT id FROM "Customer" WHERE email=$1',[email])).rows[0].id as string};
}
async function submit(page:Page,mixed:boolean) {
  await page.goto("/menu");
  await page.waitForFunction(()=>document.querySelector('[data-testid="menu-navigation"]')?.parentElement?.style.getPropertyValue("--menu-nav-height"));
  await page.getByTestId("dish-card").filter({hasText:"Хачапури по-аджарски"}).click();
  await page.getByLabel(/Двойной сыр/).check();if(mixed)await page.getByRole("button",{name:"Больше",exact:true}).click();
  await page.getByRole("button",{name:/Добавить ·/}).click();
  if(mixed){await page.getByTestId("menu-switch").getByRole("tab",{name:"Тестовое меню 2"}).click();await page.getByTestId("dish-card").first().click();await page.getByRole("button",{name:/Добавить ·/}).click();}
  await page.getByRole("button",{name:/Корзина ·/}).click();await page.getByRole("button",{name:/Оформить ·/}).click();
  await page.getByRole("button",{name:"Самовывоз",exact:true}).click();await page.getByLabel("Имя",{exact:true}).fill("QA Account Summary");await page.getByLabel("Телефон",{exact:true}).fill("+79990001144");
  const response=page.waitForResponse(r=>r.url().endsWith("/api/order")&&r.request().method()==="POST");await page.getByRole("button",{name:/Заказать ·/}).click();
  const {order}=await(await response).json();expect(order?.id).toBeTruthy();await expect(page.getByRole("heading",{name:/Заказ №\d+ принят/})).toBeVisible();return order as {id:string;number:number};
}
async function cleanup(customer:{id:string;email:string}|undefined) {
  if(!customer)return;
  const ids=(await pool.query('SELECT id FROM "Order" WHERE "customerId"=$1',[customer.id])).rows.map(r=>r.id);
  await pool.query('DELETE FROM "AdminEvent" WHERE reference=ANY($1::text[])',[ids]);
  await pool.query('DELETE FROM "BonusTransaction" WHERE "customerId"=$1',[customer.id]);await pool.query('DELETE FROM "OrderItem" WHERE "orderId"=ANY($1::text[])',[ids]);await pool.query('DELETE FROM "Order" WHERE id=ANY($1::text[])',[ids]);
  await pool.query('DELETE FROM "Session" WHERE "customerId"=$1',[customer.id]);await pool.query('DELETE FROM "AuthCode" WHERE email=$1',[customer.email]);await pool.query('DELETE FROM "Customer" WHERE id=$1',[customer.id]);
}
async function fit(page:Page){
  await page.evaluate(()=>document.fonts.ready);
  const geometry=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,offenders:[...document.querySelectorAll('main *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,class:e.className,width:e.getBoundingClientRect().width,right:e.getBoundingClientRect().right,text:e.textContent?.slice(0,35)})).slice(0,12)}));
  expect(geometry.overflow,JSON.stringify(geometry)).toBeLessThanOrEqual(1);
}

test("кабинет: историческая цена с добавками ×2, оба меню, ожидаемые и фактические бонусы",async({page,browser},info)=>{
  test.setTimeout(150_000);let customer:Awaited<ReturnType<typeof login>>|undefined;
  let original:{dishId:string;dishPrice:number;modifierId:string;modifierPrice:number}|undefined;
  const adminContext=await browser.newContext({viewport:{width:1440,height:1000},baseURL:process.env.E2E_BASE_URL||"http://localhost:3000",serviceWorkers:"block"});
  try{
    const suffix=info.project.name==="desktop"?3:info.project.name==="webkit-mobile"?2:1;
    customer=await login(page,`10.99.211.${suffix}`);const order=await submit(page,true);
    const stored=(await pool.query('SELECT "bonusAccrued" FROM "Order" WHERE id=$1',[order.id])).rows[0];
    const item=(await pool.query('SELECT * FROM "OrderItem" WHERE "orderId"=$1 AND quantity=2',[order.id])).rows[0];expect(item.total).toBe(1160);
    const modifier=(await pool.query('SELECT id,price FROM "Modifier" WHERE name=\'Двойной сыр\' LIMIT 1')).rows[0];
    original={dishId:item.dishId,dishPrice:item.price,modifierId:modifier.id,modifierPrice:modifier.price};
    await pool.query('UPDATE "Dish" SET price=price+99 WHERE id=$1',[item.dishId]);await pool.query('UPDATE "Modifier" SET price=price+33 WHERE id=$1',[modifier.id]);
    await page.goto("/account/orders/"+order.id);const line=page.getByRole("listitem").filter({hasText:"Хачапури по-аджарски"});
    await expect(line).toContainText("×2");await expect(line).toContainText("Двойной сыр");await expect(line.getByText(money(item.total),{exact:true})).toBeVisible();
    await expect(page.getByText("Блюдо второй группы",{exact:false})).toBeVisible();await expect(page.getByText("Бонусы после выполнения",{exact:true})).toBeVisible();await expect(page.getByText("Начислено бонусов",{exact:true})).toHaveCount(0);await fit(page);
    await page.screenshot({path:info.outputPath("account-bonus-expected.png")});
    expect((await pool.query('SELECT count(*)::int n FROM "BonusTransaction" WHERE "orderId"=$1 AND type=\'accrual\'',[order.id])).rows[0].n).toBe(0);
    await page.goto("/account");await expect(page.getByRole("link",{name:`Заказ №${order.number}`,exact:true}).locator("../..")).toContainText(`Бонусы после выполнения: +${stored.bonusAccrued}`);await expect(page.getByTestId("bonus-balance")).toHaveText("0");await fit(page);
    const admin=await adminContext.newPage();await gotoAdmin(admin,"/admin/login");await loginAdminUi(admin);await gotoAdmin(admin,"/admin?selected="+order.id);
    const detail=admin.getByRole("region",{name:"Детали заказа"});
    for(const [label,next] of [["Принять","Готовится"],["Готовится","Готов"],["Готов","Выдан"]]){await detail.getByRole("button",{name:label,exact:true}).click();await expect(detail.getByRole("button",{name:next,exact:true})).toBeVisible();}
    await page.goto("/account/orders/"+order.id);await expect(page.getByText("Бонусы после выполнения",{exact:true})).toBeVisible();
    await detail.getByRole("button",{name:"Выдан",exact:true}).click();await expect(detail.getByRole("button",{name:"Выдан",exact:true})).toHaveCount(0);
    await page.reload();await expect(page.getByText("Начислено бонусов",{exact:true})).toBeVisible();await expect(page.getByText("Бонусы после выполнения",{exact:true})).toHaveCount(0);await expect(page.getByText(`+${stored.bonusAccrued}`,{exact:true})).toBeVisible();
    await page.reload();expect((await pool.query('SELECT amount FROM "BonusTransaction" WHERE "orderId"=$1 AND type=\'accrual\'',[order.id])).rows).toEqual([{amount:stored.bonusAccrued}]);
    await page.goto("/account");await expect(page.getByTestId("bonus-balance")).toHaveText(String(stored.bonusAccrued));await expect(page.getByRole("link",{name:`Заказ №${order.number}`,exact:true}).locator("../..")).toContainText(`Начислено бонусов: +${stored.bonusAccrued}`);await fit(page);
  }finally{
    if(original){await pool.query('UPDATE "Dish" SET price=$2 WHERE id=$1',[original.dishId,original.dishPrice]);await pool.query('UPDATE "Modifier" SET price=$2 WHERE id=$1',[original.modifierId,original.modifierPrice]);}
    await adminContext.close();await cleanup(customer);
  }
});

test("кабинет: отмена не обещает кэшбэк, сторно и возврат не выдают за начисление",async({page},info)=>{
  let customer:Awaited<ReturnType<typeof login>>|undefined;
  try{
    const suffix=info.project.name==="desktop"?3:info.project.name==="webkit-mobile"?2:1;customer=await login(page,`10.99.212.${suffix}`);const order=await submit(page,false);
    await page.goto("/account/orders/"+order.id);page.once("dialog",d=>void d.accept());await page.getByRole("button",{name:"Отменить",exact:true}).click();
    await expect(page.getByText("Отменён",{exact:true})).toBeVisible();await expect(page.getByText("Бонусы после выполнения",{exact:true})).toHaveCount(0);await expect(page.getByText("Начислено бонусов",{exact:true})).toHaveCount(0);
    // Исторический заказ с ранее начисленным и полностью сторнированным кэшбэком.
    await pool.query('INSERT INTO "BonusTransaction" (id,"customerId","orderId",type,amount) VALUES ($1,$5,$6,\'accrual\',41),($2,$5,$6,\'reversal\',-41),($3,$5,$6,\'spend\',-10),($4,$5,$6,\'refund\',10)',[crypto.randomUUID(),crypto.randomUUID(),crypto.randomUUID(),crypto.randomUUID(),customer.id,order.id]);
    await page.reload();await expect(page.getByText("Начисление отменено",{exact:true})).toBeVisible();await expect(page.getByText("Начислено бонусов",{exact:true})).toHaveCount(0);await fit(page);
    await page.goto("/account");await expect(page.getByTestId("bonus-balance")).toHaveText("0");await expect(page.getByRole("link",{name:`Заказ №${order.number}`,exact:true}).locator("../..")).toContainText("Начисление отменено: 0");await fit(page);
  }finally{await cleanup(customer);}
});
