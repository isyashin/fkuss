import { redirect } from "next/navigation";
import { isPlatformAdmin } from "@/lib/platform-admin-auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function PlatformLoginPage() {
  if (await isPlatformAdmin()) redirect("/admin");
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl mb-6 text-center">Платформа</h1>
        <LoginForm />
      </div>
    </main>
  );
}
