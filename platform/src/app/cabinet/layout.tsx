import type { ReactNode } from "react";
import { getSessionOwner } from "@/lib/owner-auth";
import { PfShell } from "@/components/pf-shell";

export const dynamic = "force-dynamic";

export default async function CabinetLayout({ children }: { children: ReactNode }) {
  const owner = await getSessionOwner();
  if (!owner) return <>{children}</>;
  return (
    <PfShell variant="cabinet" crumb="Кабинет" userName={owner.email} userRole="Владелец сайта"
      nav={[{ href: "/cabinet", label: "Мой сайт" }]}>
      {children}
    </PfShell>
  );
}
