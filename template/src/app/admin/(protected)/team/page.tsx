import { redirect } from "next/navigation";
import { requireAdminPermission } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// Редизайн: секция «Настройки → Сотрудники». Проверка права сохранена:
// сотрудник без PIN получает редирект на ?pin=1 (admin-auth).
export default async function AdminTeamPage() {
  await requireAdminPermission("manage");
  redirect("/admin/settings?section=team");
}
