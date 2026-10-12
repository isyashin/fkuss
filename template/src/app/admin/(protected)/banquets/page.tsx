import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Редизайн: банкеты — секция «Настройки → Банкеты».
export default async function AdminBanquetsPage() {
  redirect("/admin/settings?section=banquets");
}
