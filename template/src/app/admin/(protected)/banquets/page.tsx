import { getPrisma } from "@/lib/db";
import { getSiteSettings } from "@/lib/site";
import { BanquetsAdmin } from "./banquets-admin";

export const dynamic = "force-dynamic";

export default async function AdminBanquetsPage() {
  const prisma = getPrisma();
  const [settings, halls] = await Promise.all([
    getSiteSettings(),
    prisma.banquetHall.findMany({ orderBy: { position: "asc" } }),
  ]);

  const banquets = (settings as { banquets?: Record<string, unknown> }).banquets ?? {};

  return (
    <div>
      <h1 className="text-2xl mb-4">Банкеты</h1>
      <BanquetsAdmin settings={banquets} halls={halls} />
    </div>
  );
}
