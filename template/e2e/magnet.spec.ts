import {expect,test} from '@playwright/test';
import {loginAdminUi,gotoAdmin} from './login-admin';
test.use({serviceWorkers:'block'});
import sharp from 'sharp';import jsQR from 'jsqr';import {PDFDocument}from'pdf-lib';

test('МГ-01: четыре блюда, оба меню, текст и шрифты, автосохранение и настоящий QR',async({page})=>{
 test.setTimeout(180_000);
 await page.goto('/admin/login');await loginAdminUi(page);await gotoAdmin(page,'/admin/settings?section=print');
 await page.getByRole('tab',{name:/Магнит · 50/}).click();const editor=page.getByTestId('magnet-editor');
 await expect(editor.getByRole('img',{name:/Предпросмотр/})).toBeVisible();
 await editor.getByLabel('Название',{exact:true}).fill('Ресторан тестов');
 await editor.getByLabel('Фраза над акцентом').fill('На нашем сайте на');
 await editor.getByLabel('Крупный акцент').fill('20%');await editor.getByLabel('Фраза справа').fill('дешевле');
 await expect(editor.getByRole('status')).toHaveText('Сохранено');
 const selected:string[]=[];
 for(let i=0;i<4;i++){
  await editor.getByRole('button',{name:new RegExp(`^Фото ${i+1}:`)}).click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
  const box=await dialog.boundingBox();const viewport=page.viewportSize()!;expect(box!.x).toBeGreaterThanOrEqual(10);expect(box!.x+box!.width).toBeLessThanOrEqual(viewport.width-10);
  const menus=dialog.getByLabel('Меню для магнита');if(await menus.count()){const values=await menus.locator('option').evaluateAll(options=>options.map(o=>(o as HTMLOptionElement).value));expect(values.length).toBeGreaterThanOrEqual(3);await menus.selectOption(values[1+i%2]);}
  const choice=dialog.locator('button').filter({has:page.locator('img')}).first();selected.push(await choice.innerText());await choice.click();await expect(dialog).not.toBeVisible();
  await expect(editor.getByRole('status')).toHaveText('Сохранено');
  await expect(editor.locator('button img').nth(i)).toHaveJSProperty('complete',true);
  await expect(editor.locator('button img').nth(i)).not.toHaveJSProperty('naturalWidth',0);
 }
 expect(new Set(selected).size).toBeGreaterThanOrEqual(2);
 for(const font of ['oswald','pt-sans','roboto-condensed']){await editor.getByLabel('Шрифт',{exact:true}).selectOption(font);await expect(editor.getByRole('status')).toHaveText('Сохранено');await expect(editor.getByRole('button',{name:'Скачать для печати'})).toBeEnabled();}
 await page.getByRole('tab',{name:/Визитка/}).click();await page.getByRole('tab',{name:/Магнит · 50/}).click();await expect(editor.getByLabel('Крупный акцент')).toHaveValue('20%');
 await page.reload();await page.getByRole('tab',{name:/Магнит · 50/}).click();await expect(editor.getByLabel('Название',{exact:true})).toHaveValue('Ресторан тестов');await expect(editor.getByLabel('Фраза над акцентом')).toHaveValue('На нашем сайте на');
 const url=await editor.locator('a[target="_blank"]').getAttribute('href');
 for(const format of ['PNG','для печати']){
  const action=format==='PNG'?'png':'pdf';
  const [download]=await Promise.all([
    page.waitForEvent('download',{timeout:130_000}),
    page.waitForResponse(r=>r.url().endsWith('/api/admin/magnet')&&r.request().postDataJSON()?.action===action).then(async response=>{
      expect(response.ok(),`${action} HTTP ${response.status()}: ${response.ok()?'':await response.text()}`).toBe(true);
    }),
    editor.getByRole('button',{name:`Скачать ${format}`,exact:true}).click(),
  ]);
  const chunks:Buffer[]=[];
  for await(const chunk of await download.createReadStream())chunks.push(Buffer.from(chunk));const bytes=Buffer.concat(chunks);
  if(format==='PNG'){const{data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});expect(jsQR(new Uint8ClampedArray(data),info.width,info.height)?.data).toBe(url);}
  else{const pdf=await PDFDocument.load(bytes);expect(pdf.getSubject()).toBe(url);expect(pdf.getPage(0).getTrimBox().width).toBeCloseTo(50/25.4*72);}
  await expect(editor.getByRole('button',{name:'Скачать для печати'})).toBeEnabled();
 }
 await editor.getByLabel('Название',{exact:true}).fill('Ш'.repeat(72));await expect(editor.getByRole('status')).toContainText('Сократите');await expect(editor.getByRole('button',{name:'Скачать для печати'})).toBeDisabled();
 await editor.getByLabel('Название',{exact:true}).fill('Ресторан тестов');await expect(editor.getByRole('status')).toHaveText('Сохранено');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('МГ-02: ошибка сети не теряет текст, конкурирующая вкладка не затирает макет',async({page,context})=>{
 test.setTimeout(90_000);
 await page.goto('/admin/login');await loginAdminUi(page);await gotoAdmin(page,'/admin/settings?section=print');await page.getByRole('tab',{name:/Магнит · 50/}).click();
 const editor=page.getByTestId('magnet-editor');const lead=editor.getByLabel('Фраза над акцентом');
 await page.route('**/api/admin/magnet',route=>route.request().postDataJSON()?.action==='save'?route.abort('failed'):route.continue());
 const offlineText='Без сети '+Date.now().toString(36);await lead.fill(offlineText);await expect(editor.getByRole('status')).not.toHaveText('Сохранено');await expect(editor.getByRole('button',{name:'Повторить'})).toBeVisible({timeout:20_000});expect(await lead.inputValue()).toBe(offlineText);
 await page.unroute('**/api/admin/magnet');await editor.getByRole('button',{name:'Повторить'}).click();await expect(editor.getByRole('status')).toHaveText('Сохранено');
 const second=await context.newPage();await gotoAdmin(second,'/admin/settings?section=print');await second.getByRole('tab',{name:/Магнит · 50/}).click();
 await lead.fill('Сохранено в первой вкладке');await expect(editor.getByRole('status')).toHaveText('Сохранено');
 await second.getByTestId('magnet-editor').getByLabel('Фраза над акцентом').fill('Устаревшая вкладка');await expect(second.getByRole('status').filter({hasText:'другой вкладке'})).toBeVisible();
 await second.reload();await second.getByRole('tab',{name:/Магнит · 50/}).click();await expect(second.getByLabel('Фраза над акцентом')).toHaveValue('Сохранено в первой вкладке');await second.close();
});



test('МГ-03: правка во время сохранения не теряется и не запускает бесконечную очередь',async({page})=>{
 await page.goto('/admin/login');await loginAdminUi(page);await gotoAdmin(page,'/admin/settings?section=print');await page.getByRole('tab',{name:/Магнит · 50/}).click();
 const editor=page.getByTestId('magnet-editor');let release!:()=>void;const gate=new Promise<void>(r=>release=r);let saves=0;
 await page.route('**/api/admin/magnet',async route=>{if(route.request().postDataJSON()?.action==='save'){saves++;if(saves===1)await gate;}await route.continue();});
 const requested=page.waitForRequest(r=>r.url().endsWith('/api/admin/magnet')&&r.postDataJSON()?.action==='save');
 const lead='Очередь '+Date.now().toString(36);await editor.getByLabel('Фраза над акцентом').fill(lead);await requested;
 const accent=(await editor.getByLabel('Крупный акцент').inputValue())==='15%'?'16%':'15%';await editor.getByLabel('Крупный акцент').fill(accent);release();await expect(editor.getByRole('status')).toHaveText('Сохранено');
 await page.waitForTimeout(1500);expect(saves).toBe(2);
 await page.reload();await page.getByRole('tab',{name:/Магнит · 50/}).click();await expect(editor.getByLabel('Фраза над акцентом')).toHaveValue(lead);await expect(editor.getByLabel('Крупный акцент')).toHaveValue(accent);
});
