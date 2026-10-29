import{afterAll,beforeAll,describe,expect,it,vi}from'vitest';
import{mkdtemp,mkdir,readFile,rm,writeFile}from'node:fs/promises';
import path from'node:path';import os from'node:os';import sharp from'sharp';
import{getPrisma}from'../src/lib/db';import{defaultMagnet,magnetInput}from'../src/lib/magnet';
vi.mock('../src/lib/site',()=>({getSiteRestaurant:async()=>({name:'Ресторан тестов'}),getSiteSettings:async()=>({domains:{canonical:'test.example.com'}}),contentAssetUrl:(v:string)=>v}));
import{saveMagnet,readMagnet}from'../src/lib/magnet-server';
describe.skipIf(!process.env.DATABASE_URL)('magnet immutable snapshots and atomic drafts',()=>{
 const db=getPrisma();const old=process.env.CONTENT_DIR;let dir:string;let original:unknown;const id='qa-magnet-category';
 beforeAll(async()=>{
  original=(await db.settings.findUnique({where:{key:'magnet50'}}))?.value;await db.settings.deleteMany({where:{key:'magnet50'}});
  dir=await mkdtemp(path.join(os.tmpdir(),'fkuss-magnet-db-'));process.env.CONTENT_DIR=dir;await mkdir(path.join(dir,'images'),{recursive:true});
  await writeFile(path.join(dir,'images/source.webp'),await sharp({create:{width:800,height:600,channels:3,background:'#aa4c22'}}).webp().toBuffer());
  await db.category.create({data:{id,name:'QA печать'}});await db.dish.create({data:{id:'qa-magnet-dish',categoryId:id,name:'Полное фото',price:1,image:'images/source-sm.webp',tags:[]}});
 });
 afterAll(async()=>{
  await db.dish.deleteMany({where:{categoryId:id}});await db.category.deleteMany({where:{id}});await db.settings.deleteMany({where:{key:'magnet50'}});
  if(original)await db.settings.create({data:{key:'magnet50',value:original as never}});
  if(old===undefined)delete process.env.CONTENT_DIR;else process.env.CONTENT_DIR=old;await rm(dir,{recursive:true,force:true});
 });
 it('uses full source and freezes it across menu changes, without trusting foreign snapshots',async()=>{
  const input=magnetInput(defaultMagnet('Тест'));input.photos[0]={dishId:'qa-magnet-dish'};
  const saved=await saveMagnet(input);expect(saved.revision).toBe(1);expect(saved.photos[0]!.height).toBeGreaterThanOrEqual(599);expect(saved.photos[0]!.dpi).toBeGreaterThan(400);
  const bytes=await readFile(path.join(dir,`images/print-assets/${saved.photos[0]!.snapshot}.jpg`));
  await rm(path.join(dir,'images/source.webp'));await db.dish.delete({where:{id:'qa-magnet-dish'}});
  const next=await saveMagnet({...magnetInput(saved),lead:'Снимок сохранён'});expect(next.photos[0]).toEqual(saved.photos[0]);expect(await readFile(path.join(dir,`images/print-assets/${next.photos[0]!.snapshot}.jpg`))).toEqual(bytes);
  await expect(saveMagnet({...magnetInput(next),photos:[{dishId:'other',snapshot:'f'.repeat(64)},null,null,null]})).rejects.toThrow('не относится');
 });
 it('accepts exactly one concurrent save, while preserving unrelated legacy designs',async()=>{
  const current=await readMagnet();const legacy=await db.settings.findUnique({where:{key:'printMaterials'}});
  const results=await Promise.allSettled(Array.from({length:5},(_,i)=>saveMagnet({...magnetInput(current),lead:`Изменение ${i}`})));
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect((await readMagnet()).revision).toBe(current.revision+1);
  expect(await db.settings.findUnique({where:{key:'printMaterials'}})).toEqual(legacy);
 });
});
