import { requireAdminPermission } from "@/lib/admin-auth";
import { getPrisma } from "@/lib/db";
import { AdminSettingsSubpage } from "../admin-settings-subpage";
import { TeamAdmin } from "./team-admin";

export const dynamic = "force-dynamic";

export default async function AdminTeamPage() {
  await requireAdminPermission("manage");
  const users = await getPrisma().adminUser.findMany({ orderBy: { createdAt: "asc" },
    select: { id: true, login: true, name: true, role: true, active: true, updatedAt: true } });
  return <AdminSettingsSubpage title="Сотрудники" description="Личные учётные записи и права в админке этого ресторана.">
    <TeamAdmin users={users}/>
  </AdminSettingsSubpage>;
}
