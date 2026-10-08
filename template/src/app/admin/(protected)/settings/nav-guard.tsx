"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { confirmDiscard } from "../admin-dirty";

/** Перехват переходов по ссылкам навигации настроек (F06):
    при несохранённых правках спрашиваем, потерять ли их. */
export function SettingsNavGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  return (
    <div
      onClickCapture={(event) => {
        const anchor = (event.target as HTMLElement).closest("a[href]");
        if (!anchor) return;
        if (!(event.target as HTMLElement).closest("nav")) return;
        event.preventDefault();
        event.stopPropagation();
        void confirmDiscard().then((proceed) => {
          if (proceed) router.push(anchor.getAttribute("href") ?? "/admin/settings");
        });
      }}
    >
      {children}
    </div>
  );
}
