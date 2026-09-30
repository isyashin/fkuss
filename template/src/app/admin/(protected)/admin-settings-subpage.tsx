import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./admin-settings-subpage.module.css";

export function AdminSettingsSubpage({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <div className={styles.page}>
    <Link className={styles.back} href="/admin/settings">← Настройки</Link>
    <header className={styles.header}><span>Раздел настроек</span><h1>{title}</h1>{description && <p>{description}</p>}</header>
    <div className={styles.content}>{children}</div>
  </div>;
}
