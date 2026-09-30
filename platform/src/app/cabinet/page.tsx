import { getSessionOwner } from "@/lib/owner-auth";
import { PfLoginShell } from "@/components/pf-shell";
import { OwnerLoginForm } from "./login-form";
import { OwnerDashboard } from "./dashboard";

export const dynamic = "force-dynamic";

export default async function CabinetPage() {
  const owner = await getSessionOwner();

  if (!owner) {
    return (
      <PfLoginShell eyebrow="FKUSS" title="Кабинет владельца сайта" lead="Введите email — пришлём одноразовый код входа.">
        <OwnerLoginForm />
      </PfLoginShell>
    );
  }
  return <OwnerDashboard ownerId={owner.id} />;
}
