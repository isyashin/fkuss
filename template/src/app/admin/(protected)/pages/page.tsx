import { getPrisma } from "@/lib/db";
import { PagesAdmin } from "./pages-admin";

export const dynamic = "force-dynamic";

export default async function AdminPagesPage() {
  const prisma = getPrisma();
  const pages = await prisma.page.findMany();

  return (
    <div>
      <h1 className="text-2xl mb-4">Страницы</h1>
      <PagesAdmin pages={pages} />
    </div>
  );
}
