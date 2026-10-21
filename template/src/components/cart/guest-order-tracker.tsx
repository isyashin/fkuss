"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useMounted } from "@/lib/use-mounted";
import { useCart } from "@/lib/cart/store";
import { refreshGuestOrders, resetGuestOrders, useGuestOrders } from "@/lib/order/guest-order-store";
import { guestOrderLabel, isGuestOrderFinished, type GuestOrderDetail } from "@/lib/order/guest-order-state";
import styles from "./guest-order-tracker.module.css";

const money=(amount:number)=>`${amount.toLocaleString("ru-RU")} ₽`;
function paymentLabel(status:string,method:string) {
  if(method!=="online") return "При получении";
  return ({paid:"Оплачен",pending:"Ожидает оплаты",failed:"Оплата не прошла",refunded:"Возвращён"} as Record<string,string>)[status] ?? "Проверяем оплату";
}
function safePaymentUrl(value:string|null):string|null {
  if(!value) return null;
  try { const url=new URL(value,location.origin);return url.protocol==="https:" || url.origin===location.origin?url.href:null; } catch { return null; }
}
export function GuestOrderTracker({restaurantPhone,loyaltyEnabled=false}:{restaurantPhone:string;loyaltyEnabled?:boolean}) {
  const pathname=usePathname();const router=useRouter();const mounted=useMounted();
  const orders=useGuestOrders(s=>s.orders);const error=useGuestOrders(s=>s.error);const verified=useGuestOrders(s=>s.verified);
  const count=useCart(s=>s.count());const total=useCart(s=>s.total());
  const [selected,setSelected]=useState<string|null>(null);
  const [detail,setDetail]=useState<GuestOrderDetail|null>(null);const [detailError,setDetailError]=useState("");
  const dialog=useRef<HTMLDialogElement>(null);const terminalTimers=useRef(new Map<string,ReturnType<typeof setTimeout>>());
  const dockRef=useRef<HTMLDivElement>(null);
  const hidden=/^\/(admin|payment|offline)(\/|$)/.test(pathname);
  const ownAccountDetail=pathname.startsWith("/account/orders/");
  const close=useCallback(()=>{
    setSelected(null);setDetail(null);
    if(history.state?.fkussGuestOrder) history.back();
  },[]);
  function open(id:string) {
    setDetail(null);setDetailError("");setSelected(id);
    if(!history.state?.fkussGuestOrder) history.pushState({...history.state,fkussGuestOrder:true},"",location.href);
  }
  useEffect(()=>{
    if(hidden) return;
    const refresh=()=>{
      if(document.visibilityState==="hidden") return;
      if(!navigator.onLine) { useGuestOrders.setState({error:"Нет связи. Показан последний известный статус."});return; }
      void refreshGuestOrders();
    };
    const storage=(event:StorageEvent)=>{
      if(event.key==="resto-cart") void useCart.persist.rehydrate();
      if(event.key==="resto-active-orders") { void useGuestOrders.persist.rehydrate(); refresh(); }
    };
    const logout=()=>{resetGuestOrders();setSelected(null);setDetail(null);};
    const offline=()=>useGuestOrders.setState({error:"Нет связи. Показан последний известный статус."});
    refresh();const interval=setInterval(()=>{if(useGuestOrders.getState().orders.length || useCart.getState().pending.length) refresh();},15_000);
    window.addEventListener("focus",refresh);window.addEventListener("online",refresh);
    window.addEventListener("offline",offline);
    document.addEventListener("visibilitychange",refresh);window.addEventListener("storage",storage);window.addEventListener("fkuss-guest-logout",logout);
    return()=>{clearInterval(interval);window.removeEventListener("focus",refresh);window.removeEventListener("online",refresh);window.removeEventListener("offline",offline);document.removeEventListener("visibilitychange",refresh);window.removeEventListener("storage",storage);window.removeEventListener("fkuss-guest-logout",logout);};
  },[hidden,pathname]);
  useEffect(()=>{
    const back=()=>{setSelected(null);setDetail(null);};
    window.addEventListener("popstate",back);return()=>window.removeEventListener("popstate",back);
  },[]);
  useEffect(()=>{
    if(!selected || selected==="list") return;
    const controller=new AbortController();
    async function load() {
      try {
        const r=await fetch(`/api/order/active/${encodeURIComponent(selected!)}`,{cache:"no-store",signal:controller.signal});
        if(!r.ok) throw new Error("detail unavailable");
        const data=await r.json();setDetail(data.order);setDetailError("");
      } catch { if(!controller.signal.aborted) setDetailError("Не удалось обновить заказ. Проверьте связь и попробуйте ещё раз."); }
    }
    void load();return()=>controller.abort();
  },[selected,orders]);
  useEffect(()=>{
    const el=dialog.current;
    if(selected && el && !el.open) el.showModal();
    if(!selected && el?.open) el.close();
  },[selected]);
  useEffect(()=>{
    // A persisted terminal value is insufficient: only a fresh server confirmation starts cleanup.
    for(const order of orders) {
      if(!hidden && isGuestOrderFinished(order) && verified[order.id]===order.updatedAt && !terminalTimers.current.has(order.id)) {
        terminalTimers.current.set(order.id,setTimeout(()=>{
          useGuestOrders.getState().acknowledge(order.id);terminalTimers.current.delete(order.id);
        },5000));
      }
    }
  },[orders,verified,hidden]);
  useEffect(()=>{
    if(selected && ((selected==="list" && !orders.length) || (selected!=="list" && !orders.some(o=>o.id===selected)))) {
      dialog.current?.close();
      if(history.state?.fkussGuestOrder) history.back();
    }
  },[orders,selected]);
  useEffect(()=>{const timers=terminalTimers.current;return()=>{for(const timer of timers.values()) clearTimeout(timer);};},[]);
  useEffect(()=>{
    const dock=dockRef.current;if(!dock) return;
    const measure=()=>document.documentElement.style.setProperty("--guest-order-dock-height",`${dock.getBoundingClientRect().height}px`);
    measure();const observer=new ResizeObserver(measure);observer.observe(dock);
    return()=>{observer.disconnect();document.documentElement.style.removeProperty("--guest-order-dock-height");};
  },[mounted,hidden,ownAccountDetail,orders.length]);
  if(!mounted || hidden) return null;
  const current=orders.find(o=>o.id===selected);
  const shown=detail && detail.id===selected ? {...detail,...current} : null;
  const paymentUrl=shown && !isGuestOrderFinished(shown)?safePaymentUrl(shown.confirmationUrl):null;
  return <>
    {orders.length>0 && !ownAccountDetail && <>
      <div className={styles.spacer} aria-hidden="true" />
      <div ref={dockRef} className={styles.dock} data-testid="guest-order-dock">
        <div className={styles.dockInner}>
          <button className={styles.orderButton} onClick={()=>open(orders.length===1?orders[0].id:"list")}>
            <span className={styles.dockTitle}>{orders.length===1?`Заказ №${orders[0].number}`:`Ваши заказы · ${orders.length}`}</span>
            <span className={styles.dockStatus} aria-live="polite">{orders.length===1?guestOrderLabel(orders[0]):"Посмотреть статусы"}{orders.length===1?` · ${money(orders[0].total)}`:""}</span>
          </button>
          {count>0 && <button className={styles.draftButton} onClick={()=>{
            if(pathname==="/" || pathname==="/menu") window.dispatchEvent(new Event("fkuss-open-cart"));
            else router.push("/?cart=1#menu");
          }}>Корзина · {count}<span>{money(total)}</span></button>}
        </div>
        {error && <p className={styles.connection} role="status">{error} <button onClick={()=>void refreshGuestOrders()}>Обновить</button></p>}
      </div>
    </>}
    {selected && <dialog ref={dialog} className={styles.dialog} aria-label={selected==="list"?"Ваши заказы":`Заказ №${current?.number ?? ""}`} onClose={()=>{setSelected(null);setDetail(null);}} onCancel={e=>{e.preventDefault();close();}} onClick={e=>{if(e.target===dialog.current) close();}}>
      <div className={styles.panel}>
        <header className={styles.header}>
          <button className={styles.back} aria-label="Закрыть заказ" onClick={close}>←</button>
          <h2>{selected==="list"?"Ваши заказы":`Заказ №${current?.number ?? shown?.number ?? ""}`}</h2>
        </header>
        <div className={styles.body}>
          {selected==="list" ? orders.map(order=><button key={order.id} className={styles.listOrder} onClick={()=>open(order.id)}>
            <span><strong>№{order.number}</strong><span>{guestOrderLabel(order)}</span></span><strong>{money(order.total)}</strong><span aria-hidden>›</span>
          </button>) : <>
            {current && <section className={styles.status} aria-live="polite"><strong>{guestOrderLabel(current)}</strong><span>{current.type==="pickup"?"Самовывоз":"Доставка"}</span></section>}
            {(error || detailError) && <p role="status" className={styles.error}>{detailError || error} <button onClick={()=>void refreshGuestOrders()}>Обновить</button></p>}
            {!shown && !detailError && <p role="status">Загружаем заказ…</p>}
            {shown && <>
              <ul className={styles.items}>{shown.items.map(item=><li key={item.id}>
                <div><strong>{item.quantity} × {item.name}</strong>
                  {item.menuName && <span>{item.menuName}</span>}
                  {Array.isArray(item.modifiers) && item.modifiers.length>0 && <span>{item.modifiers.map((m:{name?:string})=>m.name).join(", ")}</span>}
                </div><strong>{money(item.total)}</strong>
              </li>)}</ul>
              <dl className={styles.totals}>
                <div><dt>Блюда</dt><dd>{money(shown.itemsTotal)}</dd></div>
                {shown.type==="delivery" && <div><dt>Доставка</dt><dd>{shown.deliveryPrice?money(shown.deliveryPrice):"Бесплатно"}</dd></div>}
                {shown.bonusSpent>0 && <div><dt>{loyaltyEnabled ? "Бонусами" : "Скидка"}</dt><dd>−{money(shown.bonusSpent)}</dd></div>}
                <div className={styles.total}><dt>Итого</dt><dd>{money(shown.total)}</dd></div>
                <div><dt>Оплата</dt><dd>{paymentLabel(shown.paymentStatus,shown.paymentMethod)}</dd></div>
              </dl>
              {shown.addressText && shown.type==="delivery" && <section className={styles.info}><h3>Куда доставить</h3><p>{shown.addressText}</p></section>}
              {shown.desiredTime && <section className={styles.info}><h3>Когда</h3><p>{shown.desiredTime}</p></section>}
              {shown.comment && <section className={styles.info}><h3>Комментарий</h3><p>{shown.comment}</p></section>}
              {shown.paymentStatus==="failed" && <p className={styles.error}>Оплата не прошла. Заказ сохранён — свяжитесь с рестораном, прежде чем оформлять его повторно.</p>}
              {paymentUrl && <a className={styles.pay} href={paymentUrl}>Перейти к оплате · {money(shown.total)}</a>}
              {shown.paymentMethod==="online" && shown.paymentStatus==="pending" && !paymentUrl && <p role="status">Готовим ссылку на оплату. Статус обновится автоматически.</p>}
            </>}
            {restaurantPhone && <a className={styles.contact} href={`tel:${restaurantPhone.replace(/[^\d+]/g,"")}`}>Позвонить в ресторан</a>}
          </>}
        </div>
      </div>
    </dialog>}
  </>;
}
