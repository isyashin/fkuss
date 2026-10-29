import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { getPrisma } from "./db";
import { getContentDir, resolveContentFile } from "./content-dir";
import { getSiteRestaurant, getSiteSettings, contentAssetUrl } from "./site";
import { defaultMagnet, magnetInputSchema, magnetQrUrl, type MagnetDraft, type MagnetEditorData, type MagnetInput, type MagnetPhoto } from "./magnet";
import { MagnetError, magnetText } from "./magnet-renderer";

const KEY = "magnet50";
export async function readMagnet(): Promise<MagnetDraft> {
  const [row,restaurant] = await Promise.all([getPrisma().settings.findUnique({where:{key:KEY}}),getSiteRestaurant()]);
  if (!row) return defaultMagnet(restaurant.name);
  // This server-owned, versioned key never reinterprets a legacy 70×70 design.
  const parsed = magnetInputSchema.safeParse(row.value);
  if (!parsed.success) throw new MagnetError("Сохранённый шаблон не поддерживается. Обратитесь к администратору",409);
  return row.value as unknown as MagnetDraft;
}
export async function magnetEditorData(): Promise<MagnetEditorData> {
  const [draft,settings,dishes] = await Promise.all([readMagnet(),getSiteSettings(),getPrisma().dish.findMany({where:{NOT:{image:""}},include:{category:{include:{menu:true}}},orderBy:[{category:{position:"asc"}},{position:"asc"},{name:"asc"}]})]);
  return {draft,qrUrl:magnetQrUrl(settings.domains.canonical),dishes:dishes.map(d=>({id:d.id,name:d.name,image:contentAssetUrl(d.image),category:d.category.name,menu:d.category.menu?.name??"Меню"}))};
}
async function snapshot(dishId: string): Promise<MagnetPhoto> {
  const dish=await getPrisma().dish.findUnique({where:{id:dishId}});
  if(!dish?.image)throw new MagnetError("Фото блюда больше нет в меню. Выберите другое");
  // Prefer the original over the small menu thumbnail, without fetching arbitrary URLs.
  const original=dish.image.replace(/-sm\.webp$/,".webp");
  const file=await resolveContentFile(original) ?? await resolveContentFile(dish.image);
  if(!file || (await stat(file)).size>20*1024*1024)throw new MagnetError("Фото блюда недоступно или слишком большое");
  const raw=await readFile(/* turbopackIgnore: true */ file);
  const upright=await sharp(raw,{limitInputPixels:40_000_000}).rotate().toBuffer();
  const meta=await sharp(upright).metadata();if(!meta.width||!meta.height)throw new MagnetError("Не удалось прочитать фото блюда");
  const width=Math.floor(Math.min(meta.width,meta.height*25/35)),height=Math.floor(width*35/25);
  const data=await sharp(upright).resize(Math.min(width,1200),Math.min(height,1680),{fit:"cover",position:"centre",withoutEnlargement:true}).jpeg({quality:95,chromaSubsampling:"4:4:4"}).toBuffer();
  const out=await sharp(data).metadata();const hash=createHash('sha256').update(data).digest('hex');
  const root=await realpath(getContentDir());const images=path.join(root,"images");await mkdir(images,{recursive:true});
  if((await lstat(images)).isSymbolicLink())throw new MagnetError("Недоступно хранилище фото");
  const dir=path.join(images,"print-assets");
  try{await mkdir(dir);}catch(e){if((e as NodeJS.ErrnoException).code!=="EEXIST")throw e;}
  if((await lstat(dir)).isSymbolicLink())throw new MagnetError("Недоступно хранилище фото");
  const actual=await realpath(dir);const relative=path.relative(root,actual);
  if(relative.startsWith("..")||path.isAbsolute(relative))throw new MagnetError("Недоступно хранилище фото");
  const dest=path.join(actual,hash+'.jpg');
  try{await writeFile(dest,data,{flag:"wx"});}catch(e){if((e as NodeJS.ErrnoException).code!=="EEXIST")throw e;if(!await resolveContentFile(`images/print-assets/${hash}.jpg`))throw new MagnetError("Недоступно хранилище фото");}
  return {dishId,name:dish.name,snapshot:hash,width:out.width!,height:out.height!,dpi:Math.floor(Math.min(out.width!/25,out.height!/35)*25.4)};
}
export async function saveMagnet(value: MagnetInput): Promise<MagnetDraft> {
  const input=magnetInputSchema.parse(value);await magnetText({...input,photos:[null,null,null,null]});
  const current=await readMagnet();
  if(current.revision!==input.revision)throw new MagnetError("Макет изменён в другой вкладке. Обновите страницу перед продолжением",409);
  const photos=await Promise.all(input.photos.map(async(p)=>{
    if(!p)return null;
    const old=current.photos.find(old=>old?.dishId===p.dishId&&old.snapshot===p.snapshot);
    if(p.snapshot){if(!old)throw new MagnetError("Фото не относится к сохранённому макету");return old;}
    return snapshot(p.dishId);
  }));
  const next:MagnetDraft={...input,revision:input.revision+1,photos};
  await getPrisma().$transaction(async(tx)=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('magnet50',0))`;
    const row=await tx.settings.findUnique({where:{key:KEY}});
    const revision=(row?.value as unknown as MagnetDraft|undefined)?.revision??0;
    if(revision!==input.revision)throw new MagnetError("Макет изменён в другой вкладке. Обновите страницу перед продолжением",409);
    const json=JSON.parse(JSON.stringify(next));
    await tx.settings.upsert({where:{key:KEY},create:{key:KEY,value:json},update:{value:json}});
  });
  return next;
}
