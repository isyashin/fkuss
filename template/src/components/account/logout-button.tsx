"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.refresh();
      }}
      className="min-h-11 px-5 rounded-full border border-foreground/20 text-sm"
    >
      Выйти
    </button>
  );
}
