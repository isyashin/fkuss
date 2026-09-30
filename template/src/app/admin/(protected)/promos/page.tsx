import { getPrisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/admin-auth";
import { PromosAdmin } from "./promos-admin";
import { AdminSettingsSubpage } from "../admin-settings-subpage";

export const dynamic = "force-dynamic";

export default async function AdminPromosPage() {
  await requireAdminPermission("manage");
  const prisma = getPrisma();
  const promos = await prisma.promo.findMany({ orderBy: { position: "asc" } });

  return (
    <AdminSettingsSubpage title="Акции" description="Предложения, которые видят гости ресторана.">
      <PromosAdmin promos={promos} />
    </AdminSettingsSubpage>
  );
}
