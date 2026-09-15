import { getSessionCustomer } from "@/lib/auth";
import { LoginForm } from "@/components/account/login-form";
import { AccountDashboard } from "@/components/account/dashboard";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const customer = await getSessionCustomer();

  return (
    <main className="flex-1 mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="text-3xl mb-6">{customer ? "Личный кабинет" : "Вход"}</h1>
      {customer ? <AccountDashboard customer={customer} /> : <LoginForm />}
    </main>
  );
}
