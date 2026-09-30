import { getSessionCustomer } from "@/lib/auth";
import { LoginForm } from "@/components/account/login-form";
import { AccountDashboard } from "@/components/account/dashboard";

export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ ordersPage?: string }> }) {
  const customer = await getSessionCustomer();
  const { ordersPage } = await searchParams;
  const page = Number(ordersPage) > 0 ? Math.floor(Number(ordersPage)) : 1;

  return (
    <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-8">
      {customer ? <AccountDashboard customer={customer} ordersPage={page} /> : (
        <>
          <h1 className="text-3xl mb-6">Вход</h1>
          <LoginForm devLogin={process.env.DEV_GUEST_LOGIN === "1"} />
        </>
      )}
    </main>
  );
}
