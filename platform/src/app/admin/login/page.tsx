import { redirect } from "next/navigation";
import { isPlatformAdmin } from "@/lib/platform-admin-auth";
import { PfLoginShell } from "@/components/pf-shell";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function PlatformLoginPage() {
  if (await isPlatformAdmin()) redirect("/admin");
  return (
    <PfLoginShell eyebrow="FKUSS ПЛАТФОРМА" title="Вход в админку" lead="Панель владельца платформы: все сайты, биллинг и метрики.">
      <LoginForm />
    </PfLoginShell>
  );
}
