"use client";

import { useEffect, useRef, useState } from "react";
import { MAGNET_FONTS, magnetInput, magnetInputSchema, type MagnetEditorData, type MagnetDraft, type MagnetInput } from "@/lib/magnet";
import { useDirtyGuard } from "../admin-dirty";
import styles from "./magnet-admin.module.css";

const fingerprint=(input:MagnetInput)=>JSON.stringify({headline:input.headline.trim(),lead:input.lead.trim(),accent:input.accent.trim(),tail:input.tail.trim(),font:input.font,photos:input.photos.map(p=>p?{dishId:p.dishId,snapshot:p.snapshot}:null)});
async function request(action:string,body:object,signal?:AbortSignal){
  let res:Response;
  try{res=await fetch('/api/admin/magnet',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,...body}),signal:signal??AbortSignal.timeout(action==='pdf'?120_000:action==='png'?60_000:15_000)});}
  catch(e){if(e instanceof DOMException&&e.name==='AbortError')throw e;throw new Error('Нет связи с сервером. Изменения остаются на экране');}
  if(!res.ok){const data=await res.json().catch(()=>({}));throw new Error(data.error??'Не удалось выполнить запрос');}return res;
}
export function MagnetAdmin({data}:{data:MagnetEditorData}){
  const [edit,setEdit]=useState(()=>magnetInput(data.draft));
  const [saved,setSaved]=useState(()=>magnetInput(data.draft));const [isSaving,setIsSaving]=useState(false);const alive=useRef(true);
  const [draft,setDraft]=useState(data.draft);const [error,setError]=useState('');const [retry,setRetry]=useState(0);
  const [preview,setPreview]=useState('');const [previewError,setPreviewError]=useState('');const [exporting,setExporting]=useState('');
  const [slot,setSlot]=useState<number|null>(null);const [search,setSearch]=useState('');const [menu,setMenu]=useState('');const picker=useRef<HTMLDialogElement>(null);const opener=useRef<HTMLButtonElement|null>(null);
  const dirty=fingerprint(edit)!==fingerprint(saved);
  const status=isSaving?'Сохраняем…':dirty?'Есть изменения':'Сохранено';
  useDirtyGuard(dirty||isSaving);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{
    if(!dirty||isSaving||error)return;
    const parsed=magnetInputSchema.safeParse(edit);
    if(!parsed.success)return;
    const timer=window.setTimeout(async()=>{
      setIsSaving(true);const submitted={...parsed.data,revision:saved.revision};
      try{
        const result=await (await request('save',{draft:submitted})).json() as {draft:MagnetDraft};
        const normalized=magnetInput(result.draft);
        if(!alive.current)return;
        setSaved(normalized);setDraft(result.draft);setError('');
        setEdit(current=>{
          if(fingerprint(current)===fingerprint(submitted))return normalized;
          return {...current,revision:result.draft.revision,photos:current.photos.map((p,i)=>p&&p.dishId===submitted.photos[i]?.dishId&&p.snapshot===submitted.photos[i]?.snapshot?normalized.photos[i]:p)};
        });
      }catch(e){if(alive.current){setError(e instanceof Error?e.message:'Не удалось сохранить');}}
      finally{if(alive.current)setIsSaving(false);}
    },650);
    return()=>window.clearTimeout(timer);
  },[edit,saved,isSaving,error,retry,dirty]);
  useEffect(()=>{
    const controller=new AbortController();
    void request('preview',{revision:draft.revision},controller.signal).then(r=>r.json()).then(result=>{
      setPreviewError('');setPreview(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svg)}`);
    }).catch(e=>{if(e.name!=='AbortError')setPreviewError(e.message);});
    return()=>controller.abort();
  },[draft.revision,retry]);
  useEffect(()=>{
    const dialog=picker.current;if(slot!==null&&!dialog?.open)dialog?.showModal();
    if(slot===null&&dialog?.open)dialog.close();
  },[slot]);
  function close(){setSlot(null);opener.current?.focus();}
  function update(patch:Partial<MagnetInput>){setEdit(current=>({...current,...patch}));setError('');}
  async function download(format:'pdf'|'png'){
    setExporting(format);setError('');
    try{
      const res=await request(format,{revision:draft.revision});const blob=await res.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');
      a.href=url;a.download=/filename="([^"]+)"/.exec(res.headers.get('Content-Disposition')??'')?.[1]??`magnet-50x70mm.${format}`;document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),30_000);
    }catch(e){setError(e instanceof Error?e.message:'Не удалось скачать файл');}finally{setExporting('');}
  }
  const menus=[...new Set(data.dishes.map(d=>d.menu))];const query=search.trim().toLocaleLowerCase('ru');
  const choices=data.dishes.filter(d=>(!menu||d.menu===menu)&&(!query||`${d.name} ${d.category}`.toLocaleLowerCase('ru').includes(query)));
  const ready=!dirty&&status==='Сохранено'&&draft.photos.every(p=>p&&p.dpi>=150)&&!exporting&&!previewError;
  return <div className={styles.editor} data-testid="magnet-editor">
    <aside className={styles.preview}>
      <div className={styles.paper}>{preview?<img src={preview} alt="Предпросмотр магнита 50 × 70 мм"/>:<div className={styles.placeholder}>{previewError?'Предпросмотр недоступен':'Готовим предпросмотр…'}</div>}</div>
      <p className={styles.dimensions}>50 × 70 мм · вылеты в PDF по 3 мм</p>
      <p className={styles.destination}>QR откроет <a href={data.qrUrl} target="_blank" rel="noreferrer">{new URL(data.qrUrl).host}</a></p>
      {previewError&&<div><p role="alert" className={styles.error}>{previewError}</p><button type="button" className={styles.secondary} onClick={()=>{setPreviewError("");setRetry(v=>v+1);}}>Повторить предпросмотр</button></div>}
    </aside>
    <div className={styles.controls}>
      <section className={styles.section}>
        <h3>Текст</h3>
        <label>Название<textarea aria-label="Название" rows={2} maxLength={72} value={edit.headline} onChange={e=>update({headline:e.target.value})}/></label>
        <label>Фраза над акцентом<input maxLength={48} value={edit.lead} onChange={e=>update({lead:e.target.value})}/></label>
        <div className={styles.pair}>
          <label>Крупный акцент<input maxLength={12} placeholder="Например, 20%" value={edit.accent} onChange={e=>update({accent:e.target.value})}/></label>
          <label>Фраза справа<input maxLength={32} placeholder="Например, дешевле" value={edit.tail} onChange={e=>update({tail:e.target.value})}/></label>
        </div>
        <p className={styles.hint}>Если пишете о скидке, проверьте, что предложение действует на сайте.</p>
        <label>Шрифт<select aria-label="Шрифт" value={edit.font} onChange={e=>update({font:e.target.value as MagnetInput['font']})}>{MAGNET_FONTS.map(f=><option value={f.id} key={f.id}>{f.name} · {f.hint}</option>)}</select></label>
      </section>
      <section className={styles.section}>
        <h3>Блюда для коллажа</h3>
        <div className={styles.slots}>
          {edit.photos.map((p,i)=>{const frozen=draft.photos[i];const photo=frozen&&frozen.snapshot===p?.snapshot?frozen:null;const dish=data.dishes.find(d=>d.id===p?.dishId);return <button type="button" key={i} className={styles.slot} aria-label={`Фото ${i+1}: ${photo?.name??dish?.name??'Выбрать блюдо'}`} onClick={e=>{opener.current=e.currentTarget;setSearch('');setMenu('');setSlot(i);}}>
            {p?<img src={photo?`/content-asset/images/print-assets/${photo.snapshot}.jpg`:dish?.image} alt=""/>:<span className={styles.plus}>+</span>}
            <span><small>{['Слева сверху','Справа сверху','Слева снизу','Справа снизу'][i]}</small><strong>{photo?.name??dish?.name??'Выбрать блюдо'}</strong></span>
          </button>;})}
        </div>
        {draft.photos.some(p=>p&&p.dpi<300)&&<p className={styles.error}>Для чёткой печати замените фото: {draft.photos.filter(p=>p&&p.dpi<300).map(p=>`${p!.name} (${p!.dpi} dpi)`).join(', ')}. Рекомендуем от 300 dpi; ниже 150 dpi экспорт недоступен.</p>}
        {!data.dishes.length&&<p className={styles.hint}>Сначала добавьте в меню блюда с фотографиями.</p>}
      </section>
      <div className={styles.footer}>
        <p role="status" className={error?styles.error:styles.hint}>{error||(!magnetInputSchema.safeParse(edit).success?'Проверьте заполнение текста':status)}</p>
        {error&&<button type="button" className={styles.secondary} onClick={()=>{setError('');setRetry(v=>v+1);}}>Повторить</button>}
        <button type="button" className={styles.primary} disabled={!ready} onClick={()=>void download('pdf')}>{exporting==='pdf'?'Готовим PDF…':'Скачать для печати'}</button>
        <button type="button" className={styles.secondary} disabled={!ready} onClick={()=>void download('png')}>{exporting==='png'?'Готовим PNG…':'Скачать PNG'}</button>
        <p className={styles.hint}>PDF 56 × 76 мм с линией реза 50 × 70 мм. PNG 1181 × 1654, 600 dpi, без вылетов. Цвет RGB; профиль для тиража согласуйте с типографией.</p>
      </div>
    </div>
    <dialog ref={picker} className={styles.dialog} onCancel={e=>{e.preventDefault();close();}} onClick={e=>{if(e.target===e.currentTarget)close();}} aria-labelledby="magnet-picker-title">
      <div className={styles.dialogContent}>
        <header><h3 id="magnet-picker-title">Фото {slot===null?'':slot+1} · Выберите блюдо</h3><button type="button" aria-label="Закрыть выбор блюда" onClick={close}>×</button></header>
        <div className={styles.filters}>
          <input aria-label="Найти блюдо для магнита" placeholder="Название блюда или категория" value={search} onChange={e=>setSearch(e.target.value)}/>
          {menus.length>1&&<select aria-label="Меню для магнита" value={menu} onChange={e=>setMenu(e.target.value)}><option value="">Все меню</option>{menus.map(m=><option key={m}>{m}</option>)}</select>}
        </div>
        <div className={styles.choices}>
          {choices.map(d=><button key={d.id} type="button" onClick={()=>{if(slot!==null)update({photos:edit.photos.map((p,i)=>i===slot?{dishId:d.id}:p)});close();}}><img src={d.image} loading="lazy" alt=""/><span><strong>{d.name}</strong><small>{[d.menu,d.category].join(' · ')}</small></span></button>)}
          {!choices.length&&<p className={styles.hint}>Блюда не найдены. Измените поиск или меню.</p>}
        </div>
      </div>
    </dialog>
  </div>;
}

