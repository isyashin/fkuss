import { getPrisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSiteSettings } from "@/lib/site";
import { BanquetsAdmin } from "./banquets-admin";
import { AdminSettingsSubpage } from "../admin-settings-subpage";

export const dynamic = "force-dynamic";

export default async function AdminBanquetsPage() {
  await requireAdminPermission("manage");
  const prisma = getPrisma();
  const [settings, halls] = await Promise.all([
    getSiteSettings(),
    prisma.banquetHall.findMany({ orderBy: { position: "asc" } }),
  ]);

  const banquets = (settings as { banquets?: Record<string, unknown> }).banquets ?? {};

  return (
    <AdminSettingsSubpage title="Банкеты" description="Залы, условия и описание услуги.">
      <BanquetsAdmin settings={banquets} halls={halls} />
    </AdminSettingsSubpage>
  );
}
