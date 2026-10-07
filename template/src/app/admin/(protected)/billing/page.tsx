import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Редизайн: владельческие задачи живут внутри «Настроек» (секция «Подписка»).
export default async function AdminBillingPage() {
  redirect("/admin/settings?section=billing");
}
