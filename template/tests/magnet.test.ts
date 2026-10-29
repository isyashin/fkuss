import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import jsQR from "jsqr";
import { PDFDocument } from "pdf-lib";
import { defaultMagnet, magnetQrUrl, magnetInputSchema } from "../src/lib/magnet";
import { exportMagnet, magnetArtwork, magnetText } from "../src/lib/magnet-renderer";

describe("50×70 magnet artwork",()=>{
  let dir:string;const old=process.env.CONTENT_DIR;const draft=defaultMagnet("Хинкали-пироги-пицца");
  beforeAll(async()=>{
    dir=await mkdtemp(path.join(os.tmpdir(),'fkuss-magnet-'));process.env.CONTENT_DIR=dir;
    await mkdir(path.join(dir,'images/print-assets'),{recursive:true});
    const hash='a'.repeat(64);const photo=await sharp({create:{width:800,height:1120,channels:3,background:'#7e4d20'}}).jpeg().toBuffer();
    await writeFile(path.join(dir,`images/print-assets/${hash}.jpg`),photo);
    draft.photos=Array.from({length:4},(_,i)=>({dishId:`test-${i}`,name:`Блюдо ${i}`,snapshot:hash,width:800,height:1120,dpi:812}));
    draft.lead='На нашем сайте на';draft.accent='20%';draft.tail='дешевле';
  });
  afterAll(async()=>{if(old===undefined)delete process.env.CONTENT_DIR;else process.env.CONTENT_DIR=old;await rm(dir,{recursive:true,force:true});});
  it.each(['buxara.fkuss.online','batono.fkuss.online','kunak.fkuss.online','fuji.fkuss.online'])("decodes the actual PNG QR to exactly %s",async canonical=>{
    const url=magnetQrUrl(canonical);const png=await exportMagnet(draft,url,'png');
    const metadata=await sharp(png).metadata();expect(metadata.width).toBe(1181);expect(metadata.height).toBe(1654);expect(metadata.density).toBe(600);
    const {data,info}=await sharp(png).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    expect(jsQR(new Uint8ClampedArray(data),info.width,info.height)?.data).toBe(url);
  },30000);
  it('sets exact MediaBox, TrimBox and BleedBox for PDF and embeds the destination',async()=>{
    const url=magnetQrUrl('batono.example.com');const bytes=await exportMagnet(draft,url,'pdf');const pdf=await PDFDocument.load(bytes);const p=pdf.getPage(0);const mm=(n:number)=>n/25.4*72;
    expect(p.getSize().width).toBeCloseTo(mm(56));expect(p.getSize().height).toBeCloseTo(mm(76));
    for(const [key,value] of Object.entries({x:mm(3),y:mm(3),width:mm(50),height:mm(70)}))expect(p.getTrimBox()[key as "x"|"y"|"width"|"height"]).toBeCloseTo(value,8);
    expect(p.getBleedBox().width).toBeCloseTo(mm(56));expect(pdf.getSubject()).toBe(url);
  },30000);
  it.each(['roboto-condensed','oswald','pt-sans'] as const)('uses one outlined Cyrillic font for all text: %s',async font=>{
    const result=await magnetArtwork({...draft,font},'https://bistro.example.com/');
    expect(result.svg).not.toContain('<text');expect(result.svg).toContain('<path d=');expect(result.svg).not.toContain('font-family');
    expect(result.text.lines.every(l=>l.x>=3.4&&l.x+l.width<=46.6)).toBe(true);
  });
  it('rejects unreadable text, unsupported glyphs and three title lines',async()=>{
    await expect(magnetText({...draft,headline:'Ш'.repeat(72)})).rejects.toThrow('Сократите');
    await expect(magnetText({...draft,headline:'Ресторан 🍕'})).rejects.toThrow('не поддерживает');
    await expect(magnetText({...draft,headline:'Первая\nВторая\nТретья'})).rejects.toThrow('двух строк');
  });
  it('blocks incomplete or tiny photos at the server boundary',async()=>{
    await expect(exportMagnet({...draft,photos:[null,...draft.photos.slice(1)]},'https://a.test/','png')).rejects.toThrow('четыре');
    await expect(exportMagnet({...draft,photos:draft.photos.map(p=>({...p!,dpi:90}))},'https://a.test/','pdf')).rejects.toThrow('маленькое');
  });
  it('cannot accept client QR or layout parameters and rejects invalid canonical destinations',()=>{
    expect(magnetInputSchema.parse({...draft,qrUrl:'https://other.test/',size:100}).photos).toHaveLength(4);
    expect(magnetInputSchema.parse({...draft,qrUrl:'https://other.test/'})).not.toHaveProperty('qrUrl');
    for(const bad of ['https://u:p@a.test','https://a.test/other','https://a.test/?x=y','https://a.test/#x'])expect(()=>magnetQrUrl(bad)).toThrow();
    expect(magnetQrUrl('a.test/')).toBe('https://a.test/');
  });
});
