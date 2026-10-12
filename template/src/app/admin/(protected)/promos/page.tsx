import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Редизайн: акции — секция «Настройки → Акции».
export default async function AdminPromosPage() {
  redirect("/admin/settings?section=promos");
}
