import { getPrisma } from "@/lib/db";
import { MenuAdmin } from "./menu-admin";

export const dynamic = "force-dynamic";

export default async function AdminMenuPage() {
  const prisma = getPrisma();
  const categories = await prisma.category.findMany({
    orderBy: { position: "asc" },
    include: { dishes: { orderBy: { position: "asc" } } },
  });

  return (
    <div>
      <h1 className="text-2xl mb-4">Меню</h1>
      <MenuAdmin categories={categories} />
    </div>
  );
}
