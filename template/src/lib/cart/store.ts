"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CartModifier {
  id: string;
  name: string;
  price: number;
}

export interface CartItem {
  dishId: string;
  name: string;
  price: number;
  image: string;
  quantity: number;
  modifiers: CartModifier[];
}

interface CartState {
  items: CartItem[];
  add: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  remove: (dishId: string, modifiers?: CartModifier[]) => void;
  setQuantity: (dishId: string, modifiers: CartModifier[], quantity: number) => void;
  clear: () => void;
  total: () => number;
  count: () => number;
}

function sameLine(a: CartItem, dishId: string, modifiers: CartModifier[]): boolean {
  const aMods = a.modifiers.map((m) => m.id).sort().join(",");
  const bMods = modifiers.map((m) => m.id).sort().join(",");
  return a.dishId === dishId && aMods === bMods;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (item, quantity = 1) =>
        set((state) => {
          const existing = state.items.find((i) => sameLine(i, item.dishId, item.modifiers));
          if (existing) {
            return {
              items: state.items.map((i) =>
                sameLine(i, item.dishId, item.modifiers)
                  ? { ...i, quantity: i.quantity + quantity }
                  : i,
              ),
            };
          }
          return { items: [...state.items, { ...item, quantity }] };
        }),
      remove: (dishId, modifiers = []) =>
        set((state) => ({
          items: state.items.filter((i) => !sameLine(i, dishId, modifiers)),
        })),
      setQuantity: (dishId, modifiers, quantity) =>
        set((state) => ({
          items:
            quantity <= 0
              ? state.items.filter((i) => !sameLine(i, dishId, modifiers))
              : state.items.map((i) =>
                  sameLine(i, dishId, modifiers) ? { ...i, quantity } : i,
                ),
        })),
      clear: () => set({ items: [] }),
      total: () =>
        get().items.reduce(
          (sum, i) =>
            sum + (i.price + i.modifiers.reduce((m, mod) => m + mod.price, 0)) * i.quantity,
          0,
        ),
      count: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
    }),
    { name: "resto-cart" },
  ),
);
