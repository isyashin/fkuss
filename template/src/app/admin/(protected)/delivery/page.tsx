import { getPrisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/admin-auth";
import { DeliveryAdmin } from "./delivery-admin";
import { AdminSettingsSubpage } from "../admin-settings-subpage";

export const dynamic = "force-dynamic";

export default async function AdminDeliveryPage() {
  await requireAdminPermission("manage");
  const prisma = getPrisma();
  const options = await prisma.deliveryOption.findMany({ orderBy: { position: "asc" } });

  return (
    <AdminSettingsSubpage title="Варианты доставки" description="Интервалы, цены и доступность доставки.">
      <DeliveryAdmin options={options} />
    </AdminSettingsSubpage>
  );
}
