"use client";

import { useEffect, useRef } from "react";

/* Единый реестр «грязных» форм админки (F06): уход с не сохранёнными правками
   спрашивает подтверждение — при внутренних переходах и закрытии вкладки. */

type DirtyGuard = { isDirty: () => boolean };
const guards = new Set<DirtyGuard>();

let askRef: ((message: string) => Promise<boolean>) | null = null;
let pendingAsk: Promise<boolean> | null = null;

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
  if (!pendingAsk) pendingAsk = askRef(message).finally(() => { pendingAsk = null; });
  return pendingAsk;
}

/** Same-document Back/Forward must be reversible before the router unmounts forms.
 * Preserve all Next history fields; only annotate entries created in this shell.
 * Unknown/external entries still use the browser's beforeunload protection. */
export function useDirtyHistoryGuard() {
  useEffect(() => {
    const key = "__fkussAdminIndex";
    const push = history.pushState.bind(history);
    const replace = history.replaceState.bind(history);
    let index = typeof history.state?.[key] === "number" ? history.state[key] as number : 0;
    replace({ ...history.state, [key]: index }, "");
    let restoring: (() => void) | null = null;
    let permitted: number | null = null;
    let asking = false;
    history.pushState = (state, title, url) => { push({ ...state, [key]: ++index }, title, url); };
    history.replaceState = (state, title, url) => { replace({ ...state, [key]: index }, title, url); };
    const onPop = (event: PopStateEvent) => {
      const target = event.state?.[key] as number | undefined;
      if (restoring) {
        event.stopImmediatePropagation();
        const done = restoring; restoring = null; done(); return;
      }
      if (target === undefined) return;
      if (permitted === target) { permitted = null; index = target; return; }
      const delta = target - index;
      if (!delta || !anyDirty()) { index = target; return; }
      event.stopImmediatePropagation();
      // Return to the unchanged editor before opening the common dialog.
      restoring = () => {
        if (asking) return;
        asking = true;
        void confirmDiscard().then((proceed) => {
          asking = false;
          if (proceed) { permitted = target; history.go(delta); }
        });
      };
      history.go(-delta);
    };
    window.addEventListener("popstate", onPop, true);
    return () => {
      history.pushState = push; history.replaceState = replace;
      window.removeEventListener("popstate", onPop, true);
    };
  }, []);
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
