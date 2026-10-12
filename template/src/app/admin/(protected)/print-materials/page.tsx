import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Редизайн: печать — секция «Настройки → Печатные материалы».
export default async function AdminPrintMaterialsPage() {
  redirect("/admin/settings?section=print");
}
