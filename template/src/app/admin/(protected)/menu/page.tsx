import { getPrisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/admin-auth";
import { MenuAdmin } from "./menu-admin";

export const dynamic = "force-dynamic";

export default async function AdminMenuPage() {
  await requireAdminPermission("menu");
  const prisma = getPrisma();
  const [categories, menus] = await Promise.all([
    prisma.category.findMany({
      orderBy: { position: "asc" },
      include: { dishes: { orderBy: { position: "asc" } } },
    }),
    prisma.menuGroup.findMany({ orderBy: { position: "asc" } }),
  ]);

  return <MenuAdmin categories={categories} menus={menus.map((m) => ({ id: m.id, name: m.name }))} />;
}
