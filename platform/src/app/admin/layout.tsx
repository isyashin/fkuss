import type { ReactNode } from "react";
import { isPlatformAdmin } from "@/lib/platform-admin-auth";
import { PfShell } from "@/components/pf-shell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  if (!(await isPlatformAdmin())) return <>{children}</>;
  return (
    <PfShell variant="admin" crumb="Платформа" userName="Администратор" userRole="Владелец платформы"
      nav={[{ href: "/admin", label: "Сайты" }]}>
      {children}
    </PfShell>
  );
}
