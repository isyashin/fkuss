"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CartModifier { id: string; name: string; price: number }
export interface CartItem { dishId: string; name: string; price: number; image: string; quantity: number; modifiers: CartModifier[] }
interface PendingCheckout { key: string; draftId: string; fingerprint: string }
interface CartState {
  items: CartItem[];
  draftId: string;
  pending: PendingCheckout[];
  add: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  remove: (dishId: string, modifiers?: CartModifier[]) => void;
  setQuantity: (dishId: string, modifiers: CartModifier[], quantity: number) => void;
  clear: () => void;
  beginCheckout: (fingerprint: string, draftId?: string) => string;
  settleCheckout: (key: string) => void;
  rejectCheckout: (key: string) => void;
  total: () => number;
  count: () => number;
}
function sameLine(a: CartItem, dishId: string, modifiers: CartModifier[]): boolean {
  return a.dishId === dishId && a.modifiers.map(m=>m.id).sort().join(",") === modifiers.map(m=>m.id).sort().join(",");
}
/** A mutation after submission belongs to a new draft, so a late response cannot clear it. */
function editedDraft(state: CartState) {
  return state.pending.some(p=>p.draftId===state.draftId) ? crypto.randomUUID() : state.draftId;
}
export const useCart = create<CartState>()(persist((set,get)=>({
  items: [], draftId: crypto.randomUUID(), pending: [],
  add: (item, quantity=1)=>set(state=>{
    const nextDraft=editedDraft(state) || crypto.randomUUID();
    const items=nextDraft===state.draftId ? state.items : [];
    return { draftId:nextDraft, items:items.some(i=>sameLine(i,item.dishId,item.modifiers))
      ? items.map(i=>sameLine(i,item.dishId,item.modifiers)?{...i,quantity:i.quantity+quantity}:i)
      : [...items,{...item,quantity}] };
  }),
  remove: (dishId,modifiers=[])=>set(state=>({ draftId:editedDraft(state),items:state.items.filter(i=>!sameLine(i,dishId,modifiers)) })),
  setQuantity: (dishId,modifiers,quantity)=>set(state=>({ draftId:editedDraft(state),
    items: quantity<=0 ? state.items.filter(i=>!sameLine(i,dishId,modifiers)) : state.items.map(i=>sameLine(i,dishId,modifiers)?{...i,quantity}:i),
  })),
  clear: ()=>set({ items:[],draftId:crypto.randomUUID() }),
  beginCheckout: (fingerprint, draftId=get().draftId)=>{
    draftId ||= get().draftId || crypto.randomUUID();
    // Deterministic for the captured draft across tabs, even if another tab already settled it.
    const key = `${draftId}_${fingerprint}`;
    set(state=>({ draftId:state.draftId || draftId, pending:state.pending.some(p=>p.key===key)?state.pending:[...state.pending,{key,draftId,fingerprint}].slice(-100) }));
    return key;
  },
  settleCheckout: key=>set(state=>{
    const attempt=state.pending.find(p=>p.key===key);
    if(!attempt) return state;
    return { pending:state.pending.filter(p=>p.key!==key), ...(state.draftId===attempt.draftId?{items:[],draftId:crypto.randomUUID()}:{}) };
  }),
  rejectCheckout: key=>set(state=>({pending:state.pending.filter(p=>p.key!==key)})),
  total: ()=>get().items.reduce((sum,i)=>sum+(i.price+i.modifiers.reduce((s,m)=>s+m.price,0))*i.quantity,0),
  count: ()=>get().items.reduce((sum,i)=>sum+i.quantity,0),
}),{ name:"resto-cart" }));
