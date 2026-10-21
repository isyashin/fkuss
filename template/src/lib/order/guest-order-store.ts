"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useCart } from "@/lib/cart/store";
import { isGuestOrderFinished, reconcileGuestOrders, type GuestOrderSummary } from "./guest-order-state";

interface TrackingState {
  orders: GuestOrderSummary[];
  acknowledged: Record<string,string>;
  verified: Record<string,string>;
  error: string;
  receive: (orders:GuestOrderSummary[])=>void;
  acknowledge: (id:string)=>void;
  reset: ()=>void;
}
export const useGuestOrders=create<TrackingState>()(persist((set,get)=>({
  orders:[],acknowledged:{},verified:{},error:"",
  receive: orders=>{
    for(const order of orders) if(order.requestKey) useCart.getState().settleCheckout(order.requestKey);
    set(state=>({ orders:reconcileGuestOrders(state.orders,orders,state.acknowledged),
      verified:{...state.verified,...Object.fromEntries(orders.map(o=>[o.id,o.updatedAt]))},error:"" }));
  },
  acknowledge: id=>{
    const order=get().orders.find(o=>o.id===id);
    if(!order || !isGuestOrderFinished(order) || get().verified[id]!==order.updatedAt) return;
    set(state=>({ orders:state.orders.filter(o=>o.id!==id),
      acknowledged:Object.fromEntries(Object.entries({...state.acknowledged,[id]:order.updatedAt}).slice(-200)) }));
  },
  reset: ()=>set({orders:[],acknowledged:{},verified:{},error:""}),
}),{ name:"resto-active-orders",partialize:state=>({orders:state.orders,acknowledged:state.acknowledged}) }));

let polling:Promise<void>|null=null;
let generation=0;
export function resetGuestOrders() { generation++;useGuestOrders.getState().reset(); }
export function refreshGuestOrders():Promise<void> {
  if(polling) return polling;
  const current=generation;
  polling=(async()=>{
    try {
      const known=useGuestOrders.getState().orders.map(o=>o.id).slice(0,100).join(",");
      const response=await fetch(`/api/order/active?known=${encodeURIComponent(known)}`,{cache:"no-store",signal:AbortSignal.timeout(12_000)});
      if(!response.ok) throw new Error("poll failed");
      const data=await response.json();
      if(current!==generation) return;
      if(!data.available && useGuestOrders.getState().orders.length) {
        useGuestOrders.setState({error:"Нет доступа к статусу. Войдите в свой аккаунт или свяжитесь с рестораном."});
        return;
      }
      useGuestOrders.getState().receive(data.orders);
      const received=new Set(data.orders.map((order:GuestOrderSummary)=>order.id));
      if(known.split(",").filter(Boolean).some(id=>!received.has(id))) {
        useGuestOrders.setState({error:"Не удалось обновить часть заказов. Показан последний известный статус."});
      }
    } catch {
      if(current===generation) useGuestOrders.setState({error:"Нет связи. Показан последний известный статус."});
    }
  })().finally(()=>{polling=null;});
  return polling;
}
export async function prepareGuestCheckout() {
  const initialize=async()=>{
    const r=await fetch("/api/order/session",{method:"POST",cache:"no-store"});
    if(!r.ok) throw new Error("session unavailable");
  };
  // Serialize first-cookie creation across tabs; the server token stays HttpOnly.
  if(navigator.locks) await navigator.locks.request("fkuss-order-session",initialize);
  else await initialize();
}
export async function checkoutFingerprint(payload:unknown):Promise<string> {
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(payload)));
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
