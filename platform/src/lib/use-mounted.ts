"use client";
import { useSyncExternalStore } from "react";
const subscribe = () => () => {};
/** SSR-поля не принимают ввод, который React потеряет до гидратации. */
export function useMounted(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
