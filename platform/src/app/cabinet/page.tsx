import { getSessionOwner } from "@/lib/owner-auth";
import { OwnerLoginForm } from "./login-form";
import { OwnerDashboard } from "./dashboard";

export const dynamic = "force-dynamic";

export default async function CabinetPage() {
  const owner = await getSessionOwner();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="text-2xl mb-6">{owner ? "Мой сайт" : "Кабинет владельца сайта"}</h1>
      {owner ? <OwnerDashboard ownerId={owner.id} /> : <OwnerLoginForm />}
    </main>
  );
}
