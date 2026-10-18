"use client";

import type { ReactNode } from "react";
import styles from "./settings-redesign.module.css";

/** Shell handles links once for both primary and settings navigation. */
export function SettingsNavGuard({ children }: { children: ReactNode }) {
  return <div className={styles.guard}>{children}</div>;
}
