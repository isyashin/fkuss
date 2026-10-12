import { redirect } from "next/navigation";
import { requireAdminPermission } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// Редизайн: секция «Настройки → Подписка». Проверка права сохранена.
export default async function AdminBillingPage() {
  await requireAdminPermission("manage");
  redirect("/admin/settings?section=billing");
}
