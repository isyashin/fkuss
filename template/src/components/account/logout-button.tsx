"use client";

import { useRouter } from "next/navigation";
import styles from "./account.module.css";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.refresh();
      }}
      className={styles.btn + " " + styles.btnOutline}
    >
      Выйти
    </button>
  );
}
