import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Редизайн: синхронизация — секция «Настройки → Импорт из Яндекс.Еды».
export default async function AdminSyncPage() {
  redirect("/admin/settings?section=sync");
}
