import { getPrisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/admin-auth";
import { PagesAdmin } from "./pages-admin";
import { AdminSettingsSubpage } from "../admin-settings-subpage";

export const dynamic = "force-dynamic";

export default async function AdminPagesPage() {
  await requireAdminPermission("manage");
  const prisma = getPrisma();
  const pages = await prisma.page.findMany();

  return (
    <AdminSettingsSubpage title="Страницы сайта" description="Заголовки и тексты информационных страниц.">
      <PagesAdmin pages={pages} />
    </AdminSettingsSubpage>
  );
}
