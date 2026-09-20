import { getPrisma } from "@/lib/db";
import { getSiteSettings } from "@/lib/site";
import { SyncAdmin } from "./sync-admin";

export const dynamic = "force-dynamic";

export default async function AdminSyncPage() {
  const prisma = getPrisma();
  const [settings, syncState] = await Promise.all([
    getSiteSettings(),
    prisma.settings.findUnique({ where: { key: "syncState" } }),
  ]);

  return (
    <div>
      <h1 className="text-2xl mb-4">Синхронизация с Яндекс.Едой</h1>
      <SyncAdmin settings={settings} syncState={(syncState?.value ?? {}) as Record<string, unknown>} />
    </div>
  );
}
