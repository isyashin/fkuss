import { getPrisma } from "@/lib/db";
import { OrderCard } from "./order-card";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  const prisma = getPrisma();
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { items: true },
  });

  return (
    <div>
      <h1 className="text-2xl mb-4">Заказы</h1>
      {orders.length === 0 ? (
        <p className="text-muted">Заказов пока нет.</p>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </div>
  );
}
