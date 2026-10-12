"use client";

import { useEffect, useRef } from "react";

/* Единый реестр «грязных» форм админки (F06): уход с не сохранёнными правками
   спрашивает подтверждение — при внутренних переходах и закрытии вкладки. */

type DirtyGuard = { isDirty: () => boolean };
const guards = new Set<DirtyGuard>();

let askRef: ((message: string) => Promise<boolean>) | null = null;

export function setDirtyAsk(fn: ((message: string) => Promise<boolean>) | null) {
  askRef = fn;
}

export function registerDirtyGuard(guard: DirtyGuard): () => void {
  guards.add(guard);
  return () => { guards.delete(guard); };
}

export function anyDirty(): boolean {
  for (const guard of guards) {
    if (guard.isDirty()) return true;
  }
  return false;
}

/** true — можно уходить (правок нет или пользователь подтвердил потерю). */
export async function confirmDiscard(message = "Изменения не сохранены и будут потеряны."): Promise<boolean> {
  if (!anyDirty()) return true;
  if (!askRef) return false;
  return askRef(message);
}

/** Регистрирует форму как «грязную» и вешает beforeunload. */
export function useDirtyGuard(isDirty: boolean) {
  const ref = useRef(isDirty);
  useEffect(() => { ref.current = isDirty; }, [isDirty]);
  useEffect(() => {
    const unregister = registerDirtyGuard({ isDirty: () => ref.current });
    return unregister;
  }, []);
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);
}
