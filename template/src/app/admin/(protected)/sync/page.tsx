import { getPrisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSiteSettings } from "@/lib/site";
import { SyncAdmin } from "./sync-admin";
import { AdminSettingsSubpage } from "../admin-settings-subpage";

export const dynamic = "force-dynamic";

export default async function AdminSyncPage() {
  await requireAdminPermission("manage");
  const prisma = getPrisma();
  const [settings, syncState] = await Promise.all([
    getSiteSettings(),
    prisma.settings.findUnique({ where: { key: "syncState" } }),
  ]);

  return (
    <AdminSettingsSubpage title="Синхронизация с Яндекс.Едой" description="Настройки источника меню и запуск обновления.">
      <SyncAdmin settings={settings} syncState={(syncState?.value ?? {}) as Record<string, unknown>} />
    </AdminSettingsSubpage>
  );
}
