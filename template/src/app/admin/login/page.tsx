import { isAdmin } from "@/lib/admin-auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  if (await isAdmin()) {
    const { redirect } = await import("next/navigation");
    redirect("/admin");
  }

  return (
    <main className="flex-1 flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl mb-6 text-center">Админка</h1>
        <LoginForm />
      </div>
    </main>
  );
}
