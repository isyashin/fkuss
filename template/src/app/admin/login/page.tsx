import { getAdminActor } from "@/lib/admin-auth";
import { LoginForm } from "./login-form";
import styles from "./login.module.css";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  if (await getAdminActor()) {
    const { redirect } = await import("next/navigation");
    redirect("/admin");
  }

  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <span className={styles.eyebrow}>ПАНЕЛЬ РЕСТОРАНА</span>
        <h1>Вход в админку</h1>
        <p>Введите личный логин и пароль сотрудника.</p>
        <LoginForm />
      </div>
    </main>
  );
}
