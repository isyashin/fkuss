import { getPrisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/admin-auth";
import { MenuAdmin } from "./menu-admin";

export const dynamic = "force-dynamic";

export default async function AdminMenuPage() {
  await requireAdminPermission("manage");
  const prisma = getPrisma();
  const categories = await prisma.category.findMany({
    orderBy: { position: "asc" },
    include: { dishes: { orderBy: { position: "asc" } } },
  });

  return <MenuAdmin categories={categories} />;
}
