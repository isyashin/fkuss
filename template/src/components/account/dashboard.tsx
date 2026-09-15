import Link from "next/link";
import { getPrisma } from "@/lib/db";
import { getBonusBalance } from "@/lib/loyalty";
import type { Customer } from "@/generated/prisma/client";
import { LogoutButton } from "./logout-button";

const STATUS_NAMES: Record<string, string> = {
  new: "новый",
  accepted: "принят",
  cooking: "готовится",
  delivering: "в пути",
  done: "выполнен",
  cancelled: "отменён",
};

const BOOKING_STATUS: Record<string, string> = {
  new: "ожидает подтверждения",
  confirmed: "подтверждена",
  rejected: "отклонена",
  cancelled: "отменена",
};

export async function AccountDashboard({ customer }: { customer: Customer }) {
  const prisma = getPrisma();
  const [orders, bookings, balance] = await Promise.all([
    prisma.order.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { items: true },
    }),
    prisma.reservation.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    getBonusBalance(prisma, customer.id),
  ]);

  return (
    <div className="space-y-8">
      <div className="bg-card rounded-[var(--radius)] p-5 flex items-center justify-between">
        <div>
          <p className="text-muted text-sm">Бонусы</p>
          <p className="text-3xl font-semibold text-accent">{balance.toLocaleString("ru-RU")}</p>
        </div>
        <LogoutButton />
      </div>

      <section>
        <h2 className="text-xl mb-3">История заказов</h2>
        {orders.length === 0 ? (
          <p className="text-muted">Пока пусто. <Link href="/menu" className="text-accent">Перейти в меню</Link></p>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => (
              <div key={order.id} className="bg-card rounded-[var(--radius)] p-4">
                <div className="flex justify-between items-baseline gap-2">
                  <p className="font-medium">№{order.number} · {STATUS_NAMES[order.status] ?? order.status}</p>
                  <p className="text-accent font-semibold">{order.total.toLocaleString("ru-RU")} ₽</p>
                </div>
                <p className="text-muted text-sm mt-1">
                  {order.items.map((i) => `${i.name} ×${i.quantity}`).join(", ")}
                </p>
                <p className="text-muted text-xs mt-1">
                  {order.createdAt.toLocaleString("ru-RU")} · {order.type === "delivery" ? "доставка" : "самовывоз"}
                  {order.bonusAccrued > 0 && ` · +${order.bonusAccrued} бонусов`}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xl mb-3">Мои брони</h2>
        {bookings.length === 0 ? (
          <p className="text-muted">Броней нет. <Link href="/booking" className="text-accent">Забронировать</Link></p>
        ) : (
          <div className="space-y-3">
            {bookings.map((b) => (
              <div key={b.id} className="bg-card rounded-[var(--radius)] p-4">
                <p className="font-medium">{b.date} в {b.time} · {b.guests} гостей</p>
                <p className="text-muted text-sm mt-0.5">{BOOKING_STATUS[b.status] ?? b.status}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
