import { getPrisma } from "@/lib/db";
import { DeliveryAdmin } from "./delivery-admin";

export const dynamic = "force-dynamic";

export default async function AdminDeliveryPage() {
  const prisma = getPrisma();
  const options = await prisma.deliveryOption.findMany({ orderBy: { position: "asc" } });

  return (
    <div>
      <h1 className="text-2xl mb-4">Доставка</h1>
      <DeliveryAdmin options={options} />
    </div>
  );
}
