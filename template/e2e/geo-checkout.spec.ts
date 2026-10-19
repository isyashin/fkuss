import { test, expect, type Page } from "@playwright/test";
import { gotoAdmin, loginAdminUi } from "./login-admin";

// Browser routing cannot intercept requests initiated by a service worker.
// SW behaviour is covered separately; these tests mock only the preview transport.
test.use({ serviceWorkers: "block" });

async function settings(page: Page) {
  await gotoAdmin(page,"/admin/login");
  if(await page.getByLabel("Логин").isVisible()) { await loginAdminUi(page); await expect(page).toHaveURL(/\/admin$/); }
  await gotoAdmin(page,"/admin/settings?section=delivery");
}
const bar=(page:Page)=>page.getByRole("group",{name:"Сохранение зон доставки"});
async function apply(page:Page, enabled:boolean) {
  const toggle=page.getByRole("checkbox",{name:/Зоны на карте/});
  if(await toggle.isChecked()===enabled)return;
  await toggle.setChecked(enabled);await bar(page).getByRole("button",{name:"Сохранить и применить",exact:true}).click();
  await expect(bar(page).getByRole("status")).toContainText("Зоны применены",{timeout:15000});
}
async function address(page:Page,city:string,street:string,house:string) {
  await page.getByLabel("Город",{exact:true}).fill(city);await page.getByLabel("Улица",{exact:true}).fill(street);await page.getByLabel("Дом",{exact:true}).fill(house);
}

test("геозона остаётся обязательной с вариантом: дополнительные поля и поздний ответ",async({page,request},info)=>{
  test.setTimeout(90000);
  await settings(page);await apply(page,true);
  let calls=0;let delayMoscow=false;
  try {
    // Only the preview transport is mocked; POST below exercises the real server without keys.
    await page.route("**/api/delivery/zone?**",async route=>{
      calls++;const input=new URL(route.request().url()).searchParams.get("address")??"";
      if(input.startsWith("Москва")) {
        if(delayMoscow)await new Promise(resolve=>setTimeout(resolve,1200));
        await route.fulfill({json:{kind:"zone",zoneName:"Центр",tariffs:[{from:0,price:200}],deliveryMinutes:40,lat:55.75,lng:37.62}});
      } else await route.fulfill({json:{kind:"outside-blocked",lat:59.93,lng:30.31}});
    });
    await page.goto("/menu");await page.getByRole("button",{name:/Хачапури по-аджарски/}).click();
    await page.getByRole("button",{name:/Добавить ·/}).click();await page.getByRole("button",{name:/Корзина · 1/}).click();
    await page.getByRole("button",{name:"Больше",exact:true}).click();await page.getByRole("button",{name:/Оформить ·/}).click();
    await page.getByLabel("Имя",{exact:true}).fill("E2E Гео");await page.getByLabel("Телефон",{exact:true}).fill("+79990000019");
    await address(page,"Москва","Тверская улица","1");
    await expect(page.getByTestId("geo-zone")).toContainText("Зона «Центр»",{timeout:15000});
    const submit=page.getByRole("button",{name:/^Заказать/});await expect(submit).toBeEnabled();
    const before=calls;
    for(const name of ["Квартира","Подъезд","Домофон"]) { await page.getByLabel(name,{exact:true}).fill("5");await expect(submit).toBeEnabled(); }
    await page.waitForTimeout(750);expect(calls).toBe(before);await expect(page.getByTestId("geo-zone")).toContainText("Зона «Центр»");
    delayMoscow=true;
    const old=page.waitForRequest(r=>r.url().includes("/api/delivery/zone?")&&new URL(r.url()).searchParams.get("address")?.startsWith("Москва")===true);
    await page.getByLabel("Дом",{exact:true}).fill("2");await old;
    await address(page,"Санкт-Петербург","Невский проспект","1");
    await expect(page.getByTestId("geo-zone")).toContainText("Адрес вне зоны доставки");await page.waitForTimeout(1300);await expect(submit).toBeDisabled();
    const slots=await(await request.get("/api/delivery/slots")).json();const option=slots.options.find((o:{available:boolean;mode:string})=>o.available&&o.mode==="asap");expect(option).toBeTruthy();
    const r=await request.post("/api/order",{headers:{"x-forwarded-for":`10.99.65.${info.project.name==="desktop"?3:info.project.name==="webkit-mobile"?2:1}`},data:{items:[{dishId:"khachapuri-adjarski",quantity:2}],type:"delivery",zoneName:"Центр",address:"Санкт-Петербург, Невский проспект, 1",customerName:"E2E Гео",customerPhone:"+79990000019",preferredChannel:"phone",deliveryOptionId:option.id}});
    expect(r.status()).toBe(503);
  } finally { await page.unroute("**/api/delivery/zone?**");await settings(page);await apply(page,false); }
});

test("карта: явное применение, сохранение после reload и запрет пустой активной конфигурации",async({page,request})=>{
  await settings(page);await apply(page,false);
  const toggle=page.getByRole("checkbox",{name:/Зоны на карте/});const save=bar(page).getByRole("button",{name:"Сохранить и применить",exact:true});
  try {
    await toggle.check();await expect(bar(page)).toContainText("Изменения ещё не применены");
    expect((await(await request.get("/api/delivery/zone?address=Москва")).json()).kind).toBe("disabled");
    await expect(save).toBeEnabled();await save.scrollIntoViewIfNeeded();const rect=await save.boundingBox();expect(rect!.height).toBeGreaterThanOrEqual(44);expect(rect!.width).toBeGreaterThanOrEqual(44);expect(rect!.y+rect!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    await save.click();await expect(bar(page).getByRole("status")).toContainText("Зоны применены",{timeout:15000});
    await page.reload();await expect(toggle).toBeChecked();await expect(save).toBeDisabled();await expect(bar(page)).toContainText("Действуют сохранённые границы");
    const zones=page.getByRole("checkbox",{name:/Зона «.*» включена/});expect(await zones.count()).toBeGreaterThan(0);
    for(let n=0;n<await zones.count();n++)await zones.nth(n).uncheck();
    await expect(bar(page).getByRole("alert")).toContainText("хотя бы одну зону");await expect(save).toBeDisabled();
    for(let n=0;n<await zones.count();n++)await zones.nth(n).check();
  } finally { await apply(page,false); }
});
