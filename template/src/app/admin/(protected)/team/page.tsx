import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Редизайн: владельческие задачи живут внутри «Настроек» (секция «Сотрудники»).
export default async function AdminTeamPage() {
  redirect("/admin/settings?section=team");
}
