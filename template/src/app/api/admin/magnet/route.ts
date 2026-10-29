import { isAdmin } from "@/lib/admin-auth";
import { rateLimit } from "@/lib/rate-limit";
import { getSiteRestaurant, getSiteSettings } from "@/lib/site";
import { magnetFileStem, magnetInputSchema, magnetQrUrl } from "@/lib/magnet";
import { exportMagnet, magnetArtwork, MagnetError } from "@/lib/magnet-renderer";
import { readMagnet, saveMagnet } from "@/lib/magnet-server";
import { originMatches } from "../push/shared";

export const runtime="nodejs";
export const dynamic="force-dynamic";
let active=0;
const headers={"Cache-Control":"private, no-store","Vary":"Cookie","X-Content-Type-Options":"nosniff"};
const json=(value:unknown,status=200)=>Response.json(value,{status,headers});
export async function POST(request:Request){
  if(!await isAdmin("manage")||!originMatches(request))return json({error:"Forbidden"},403);
  if(!rateLimit(`magnet:${request.headers.get('x-forwarded-for')?.split(',')[0]??'unknown'}`,90,60_000)||active>=2)return json({error:"Подождите завершения предыдущего запроса"},429);
  active++;
  try{
    const reader=request.body?.getReader();if(!reader)throw new MagnetError("Пустой запрос");
    const chunks:Uint8Array[]=[];let total=0;
    while(true){const{done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>8192){await reader.cancel();throw new MagnetError("Слишком большой запрос",413);}chunks.push(value);}
    const raw=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(raw.action==='save'){
      const input=magnetInputSchema.safeParse(raw.draft);if(!input.success)throw new MagnetError(input.error.issues[0]?.message??"Проверьте поля");
      return json({draft:await saveMagnet(input.data)});
    }
    if(!['preview','png','pdf'].includes(raw.action))throw new MagnetError("Неизвестное действие");
    const [draft,settings,restaurant]=await Promise.all([readMagnet(),getSiteSettings(),getSiteRestaurant()]);
    // Export and preview read the same saved revision; QR is always resolved afresh on this tenant.
    if(raw.revision!==draft.revision)throw new MagnetError("Макет изменился. Обновите страницу",409);
    const url=magnetQrUrl(settings.domains.canonical);
    if(raw.action==='preview')return json({svg:(await magnetArtwork(draft,url)).svg,qrUrl:url,revision:draft.revision});
    const body=await exportMagnet(draft,url,raw.action);
    return new Response(new Uint8Array(body),{headers:{...headers,"Content-Type":raw.action==='png'?'image/png':'application/pdf',"Content-Disposition":`attachment; filename="${magnetFileStem(restaurant.slug)}.${raw.action}"`}});
  }catch(e){
    if(e instanceof MagnetError)return json({error:e.message},e.status);
    if(e instanceof SyntaxError)return json({error:"Некорректный запрос"},400);
    console.error('magnet operation failed',e instanceof Error?e.name:'unknown');
    return json({error:"Не удалось подготовить макет. Попробуйте ещё раз"},500);
  }finally{active--;}
}
