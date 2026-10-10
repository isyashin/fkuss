import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Редизайн: страницы — секция «Настройки → Страницы».
export default async function AdminPagesPage() {
  redirect("/admin/settings?section=pages");
}
