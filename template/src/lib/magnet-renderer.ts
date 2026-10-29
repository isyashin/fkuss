import { readFile } from "node:fs/promises";
import path from "node:path";
import { create, type Font } from "fontkit";
import pdfFontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";
import QRCode from "qrcode";
import sharp from "sharp";
import { MAGNET_SPEC, type MagnetDraft } from "./magnet";
import { resolveContentFile } from "./content-dir";

export class MagnetError extends Error { constructor(message: string, public status = 400) { super(message); } }
const mmPt = (n: number) => n * 72 / 25.4;
type Line = { text: string; x: number; baseline: number; size: number; color: string; width: number };
type Face = { font: Font; bytes: Buffer };
const faces = new Map<string, Promise<Face>>();
async function face(id: MagnetDraft["font"]): Promise<Face> {
  if (!faces.has(id)) faces.set(id, readFile(path.join(process.cwd(), "assets", "print-fonts", `${id}.ttf`)).then(bytes => ({ bytes, font: create(bytes) as Font })));
  return faces.get(id)!;
}
function width(font: Font, value: string, size: number): number { return font.layout(value,{kern:false}).advanceWidth / font.unitsPerEm * size; }
function fit(font: Font, value: string, maxWidth: number, min: number, max: number): number {
  for (const ch of value) if (!font.hasGlyphForCodePoint(ch.codePointAt(0)!)) throw new MagnetError("Выбранный шрифт не поддерживает один из символов текста");
  const size = Math.min(max, maxWidth / Math.max(0.001, width(font, value, 1)));
  if (size < min) throw new MagnetError("Текст не помещается. Сократите его, чтобы он оставался читаемым");
  return size;
}
function headlineLines(font: Font, text: string): string[] {
  const explicit = text.split(/\n/).map(s => s.trim()).filter(Boolean);
  if (explicit.length > 2) throw new MagnetError("В названии можно оставить не более двух строк");
  if (explicit.length === 2 || width(font, text, 4.5) <= 43) return explicit;
  let best = explicit, score = Infinity;
  for (let i=1; i<text.length; i++) {
    if (!/\s/.test(text[i]) && !/[-·]/.test(text[i-1])) continue;
    const lines = [text.slice(0,i).trim(),text.slice(i).trim()];
    if(lines.some(s=>!s))continue;
    const next = Math.max(...lines.map(s => width(font,s,1)));
    if (next < score) { score=next; best=lines; }
  }
  return best;
}
export async function magnetText(draft: MagnetDraft): Promise<{ face: Face; lines: Line[] }> {
  const f = await face(draft.font); const lines: Line[] = [];
  const heads = headlineLines(f.font,draft.headline);
  const headSize = Math.min(...heads.map(s => fit(f.font,s,43,4.3,heads.length === 1 ? 12 : 6.5)));
  // Bounding box is positioned by real ascender metrics, never browser font fallbacks.
  heads.forEach((text,i) => lines.push({ text, x:(50-width(f.font,text,headSize))/2, baseline:heads.length === 1 ? 11.8 : 7.4+i*6.2, size:headSize, color:"#ef4938", width:width(f.font,text,headSize) }));
  const add = (text: string, x: number, y: number, w: number, min: number, max: number, color: string, center = false) => {
    if (!text) return; const size=fit(f.font,text,w,min,max); const measured=width(f.font,text,size);
    lines.push({text,x:x+(center?(w-measured)/2:0),baseline:y,size,color,width:measured});
  };
  add(draft.lead,3.5,33,43,2.8,4.7,"#ffffff",true);
  add(draft.accent,3.5,42.5,19.5,4,11,"#ff593e");
  add(draft.tail,23.5,41.5,23,2.8,6.2,"#ffffff");
  return {face:f,lines};
}
function outlined(font: Font, line: Line): string {
  const run=font.layout(line.text,{kern:false});let x=0,y=0;
  const paths=run.glyphs.map((glyph,i) => {
    const p=run.positions[i];const value=`<path d="${glyph.path.toSVG()}" transform="translate(${x+p.xOffset} ${y+p.yOffset})"/>`;x+=p.xAdvance;y+=p.yAdvance;return value;
  }).join("");
  return `<g fill="${line.color}" transform="translate(${line.x} ${line.baseline}) scale(${line.size/font.unitsPerEm} ${-line.size/font.unitsPerEm})">${paths}</g>`;
}
export async function magnetArtwork(draft: MagnetDraft, qrUrl: string, print = false, foreground = true) {
  const text=await magnetText(draft); const b=print?3:0;
  const images=await Promise.all(draft.photos.map(async(p,i)=>{
    const x=(i%2)*25,y=Math.floor(i/2)*35;
    if(!p) return `<rect x="${x}" y="${y}" width="25" height="35" fill="${i%2?'#55483a':'#76624e'}"/>`;
    const file=await resolveContentFile(`images/print-assets/${p.snapshot}.jpg`);
    if(!file) throw new MagnetError("Сохранённое фото недоступно. Выберите блюдо заново");
    const data=await readFile(/* turbopackIgnore: true */ file);
    // Bleed extends photos outwards; foreground always stays at the original trim coordinates.
    const left=x===0?b:0,top=y===0?b:0;
    const href=`data:image/jpeg;base64,${data.toString('base64')}`;
    return {bleed:`<image href="${href}" x="${x-left}" y="${y-top}" width="${25+b}" height="${35+b}" preserveAspectRatio="none"/>`,trim:`<image href="${href}" x="${x}" y="${y}" width="25" height="35" preserveAspectRatio="none"/>`};
  }));
  const matrix=QRCode.create(qrUrl,{errorCorrectionLevel:"Q"}).modules;
  const cell=22/(matrix.size+8);
  let qr="";
  for(let y=0;y<matrix.size;y++)for(let x=0;x<matrix.size;x++)if(matrix.get(y,x))qr+=`<rect x="${14+(x+4)*cell}" y="${45.3+(y+4)*cell}" width="${cell}" height="${cell}"/>`;
  const foregroundSvg=`<rect x="3.5" y="15" width="43" height="0.72" fill="#ef4938"/>${text.lines.map(l=>outlined(text.face.font,l)).join('')}<rect x="13.5" y="44.8" width="23" height="23" rx="1.35" fill="#ffffff"/><g fill="#000000" shape-rendering="crispEdges">${qr}</g>`;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${print?56:50}mm" height="${print?76:70}mm" viewBox="0 0 ${print?56:50} ${print?76:70}"><defs><linearGradient id="top" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="27"><stop stop-color="#000" stop-opacity=".88"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient><linearGradient id="bottom" gradientUnits="userSpaceOnUse" x1="0" y1="26" x2="0" y2="70"><stop stop-color="#000" stop-opacity="0"/><stop offset=".28" stop-color="#000" stop-opacity=".66"/><stop offset="1" stop-color="#000" stop-opacity=".94"/></linearGradient></defs><g transform="translate(${b} ${b})">${images.map(i=>typeof i==='string'?i:i.bleed).join('')}${images.map(i=>typeof i==='string'?'':i.trim).join('')}<rect x="${-b}" y="${-b}" width="${50+2*b}" height="${27+b}" fill="url(#top)"/><rect x="${-b}" y="26" width="${50+2*b}" height="${44+b}" fill="url(#bottom)"/>${foreground?foregroundSvg:''}</g></svg>`;
  return {svg,matrix,cell,text};
}
export async function exportMagnet(draft: MagnetDraft, qrUrl: string, format: "png"|"pdf") {
  if(draft.photos.some(p=>!p)) throw new MagnetError("Выберите четыре фото блюд");
  if(draft.photos.some(p=>p!.dpi<150)) throw new MagnetError("Фото слишком маленькое для печати. Выберите другое блюдо");
  const artwork=await magnetArtwork(draft,qrUrl,format==='pdf',format!=='pdf');
  if(format==='png')return sharp(Buffer.from(artwork.svg),{density:600}).resize(MAGNET_SPEC.pngWidth,MAGNET_SPEC.pngHeight).withMetadata({density:600}).png().toBuffer();
  // Photos/fades are raster, text and QR remain vector with the exact same font/geometry.
  const pdf=await PDFDocument.create();pdf.registerFontkit(pdfFontkit);
  const font=await pdf.embedFont(artwork.text.face.bytes,{subset:true});
  const page=pdf.addPage([mmPt(56),mmPt(76)]);
  page.setTrimBox(mmPt(3),mmPt(3),mmPt(50),mmPt(70));page.setBleedBox(0,0,mmPt(56),mmPt(76));
  const png=await sharp(Buffer.from(artwork.svg),{density:600})
    .resize(Math.round(MAGNET_SPEC.pageWidth/25.4*600),Math.round(MAGNET_SPEC.pageHeight/25.4*600),{fit:'fill'})
    .flatten({background:'#000000'}).png().toBuffer();const image=await pdf.embedPng(png);
  page.drawImage(image,{x:0,y:0,width:mmPt(56),height:mmPt(76)});
  const color=(hex:string)=>rgb(parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255);
  page.drawRectangle({x:mmPt(6.5),y:mmPt(76-3-15-.72),width:mmPt(43),height:mmPt(.72),color:color('#ef4938')});
  for(const line of artwork.text.lines)page.drawText(line.text,{font,size:mmPt(line.size),x:mmPt(line.x+3),y:mmPt(76-3-line.baseline),color:color(line.color)});
  const qx=16.5,qy=76-3-44.8-23,r=1.35;
  page.drawRectangle({x:mmPt(qx+r),y:mmPt(qy),width:mmPt(23-2*r),height:mmPt(23),color:rgb(1,1,1)});
  page.drawRectangle({x:mmPt(qx),y:mmPt(qy+r),width:mmPt(23),height:mmPt(23-2*r),color:rgb(1,1,1)});
  for(const x of [qx+r,qx+23-r])for(const y of [qy+r,qy+23-r])page.drawCircle({x:mmPt(x),y:mmPt(y),size:mmPt(r),color:rgb(1,1,1)});
  for(let y=0;y<artwork.matrix.size;y++)for(let x=0;x<artwork.matrix.size;x++)if(artwork.matrix.get(y,x))page.drawRectangle({x:mmPt(17+(x+4)*artwork.cell),y:mmPt(76-3-45.3-(y+5)*artwork.cell),width:mmPt(artwork.cell),height:mmPt(artwork.cell),color:rgb(0,0,0)});
  pdf.setTitle('Магнит 50 × 70 мм');pdf.setSubject(qrUrl);pdf.setCreator('Fkuss');
  return Buffer.from(await pdf.save());
}

