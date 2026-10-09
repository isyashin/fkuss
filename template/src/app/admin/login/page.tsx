import type { Metadata } from "next";
import { getAdminActor } from "@/lib/admin-auth";
import { getContentDir } from "@/lib/content-dir";
import { getIconsVersion } from "@/lib/pwa-icons";
import { LoginForm } from "./login-form";
import { AdminPushManager } from "../(protected)/admin-push";
import styles from "./login.module.css";

export const dynamic = "force-dynamic";

/** Страницы админки ссылаются на отдельный манифест установки админского приложения. */
export async function generateMetadata(): Promise<Metadata> {
  const version = (await getIconsVersion(getContentDir())) ?? "1";
  return {
    manifest: "/admin/manifest.webmanifest",
    icons: {
      icon: [
        { url: `/api/site-icon?size=32&v=${version}`, type: "image/png", sizes: "32x32" },
        { url: `/api/site-icon?size=48&v=${version}`, type: "image/png", sizes: "48x48" },
      ],
      apple: `/content-asset/icons/admin-apple-touch-icon.png?v=${version}`,
    },
  };
}

export default async function AdminLoginPage() {
  if (await getAdminActor()) {
    const { redirect } = await import("next/navigation");
    redirect("/admin");
  }

  return (
    <main className={styles.page}>
      <style>{"body > header:first-of-type { display: none; }"}</style>
      <div className={styles.card}>
        <span className={styles.eyebrow}>ПАНЕЛЬ РЕСТОРАНА</span>
        <h1>Вход в админку</h1>
        <p>Введите личный логин и пароль сотрудника.</p>
        <LoginForm />
      </div>
      <AdminPushManager />
    </main>
  );
}
