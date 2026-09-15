import { getPrisma } from "@/lib/db";
import { PromosAdmin } from "./promos-admin";

export const dynamic = "force-dynamic";

export default async function AdminPromosPage() {
  const prisma = getPrisma();
  const promos = await prisma.promo.findMany({ orderBy: { position: "asc" } });

  return (
    <div>
      <h1 className="text-2xl mb-4">Акции</h1>
      <PromosAdmin promos={promos} />
    </div>
  );
}
