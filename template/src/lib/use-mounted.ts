"use client";

import { useSyncExternalStore } from "react";

function noopSubscribe(): () => void {
  return () => {};
}

/** Mounted-флаг без setState в effect (React 19 lint): false на сервере, true на клиенте */
export function useMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}
