import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionCustomer } from "@/lib/auth";
import { getSiteSettings } from "@/lib/site";
import { isGuestCabinetEnabled } from "@/lib/guest-cabinet";
import { getPrisma } from "@/lib/db";
import { orderStatusLabel } from "@/lib/order-status";
import { RepeatOrderButton } from "@/components/account/repeat-order-button";
import { CancelOrderButton } from "@/components/account/cancel-order-button";
import styles from "@/components/account/account.module.css";

export const dynamic = "force-dynamic";

function badgeClass(status: string): string {
  if (status === "cancelled") return styles.badgeRed;
  if (status === "new") return styles.badgeBlue;
  if (status === "delivered" || status === "issued") return styles.badgeGreen;
  return styles.badgeNeutral;
}

export default async function AccountOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const settings = await getSiteSettings();
  if (!isGuestCabinetEnabled(settings)) redirect("/account");
  const customer = await getSessionCustomer();
  if (!customer) redirect("/account");
  const { id } = await params;

  const prisma = getPrisma();
  const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
  if (!order || order.customerId !== customer.id) notFound();

  return (
    <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-8">
      <div className={styles.intro}>
        <span><Link href="/account" style={{ color: "inherit" }}>← личный кабинет</Link></span>
        <h1>Заказ №{order.number}</h1>
        <p>
          {order.createdAt.toLocaleString("ru-RU")} · {order.type === "delivery" ? "доставка" : "самовывоз"}{" "}
          <span className={styles.badge + " " + badgeClass(order.status)}>{orderStatusLabel(order.status)}</span>
        </p>
      </div>

      <div className={styles.panel} style={{ marginBottom: 14 }}>
        <h2 className={styles.h2}>Состав</h2>
        <ul className={styles.orderItems} style={{ fontSize: 14, color: "var(--foreground)" }}>
          {order.items.map((item) => (
            <li key={item.id}>
              <span>
                {item.name} ×{item.quantity}
                {((item.modifiers ?? []) as { name: string; price: number }[]).map((m) => (
                  <span key={m.name} style={{ color: "var(--muted)" }}><br />+ {m.name}</span>
                ))}
              </span>
              <span>{(item.price * item.quantity).toLocaleString("ru-RU")} ₽</span>
            </li>
          ))}
        </ul>
        <div className={styles.totals}>
          <div><span>Блюда</span><span>{order.itemsTotal.toLocaleString("ru-RU")} ₽</span></div>
          {order.deliveryPrice > 0 && <div><span>Доставка</span><span>{order.deliveryPrice.toLocaleString("ru-RU")} ₽</span></div>}
          {order.bonusSpent > 0 && <div className={styles.bonus}><span>Оплачено бонусами</span><span>−{order.bonusSpent}</span></div>}
          <div className={styles.grand}><span>Итого</span><span>{order.total.toLocaleString("ru-RU")} ₽</span></div>
          {order.bonusAccrued > 0 && <div className={styles.bonus}><span>Начислено бонусов</span><span>+{order.bonusAccrued}</span></div>}
        </div>
      </div>

      <div className={styles.panel} style={{ marginBottom: 14 }}>
        <h2 className={styles.h2}>Детали</h2>
        <div className={styles.facts} style={{ marginTop: 0 }}>
          <div className={styles.fact}><span>Имя</span>{order.customerName}</div>
          <div className={styles.fact}><span>Телефон</span>{order.customerPhone}</div>
          {order.addressText && <div className={styles.fact}><span>Адрес</span>{order.addressText}</div>}
          {order.desiredTime && <div className={styles.fact}><span>Время</span>{order.desiredTime}</div>}
          <div className={styles.fact}>
            <span>Оплата</span>
            {order.paymentMethod === "online"
              ? order.paymentStatus === "paid" ? "онлайн — оплачен" : "онлайн — ожидает оплаты"
              : "при получении"}
          </div>
          {order.comment && <div className={styles.fact}><span>Комментарий</span>{order.comment}</div>}
        </div>
      </div>

      <div className={styles.actionsRow}>
        <RepeatOrderButton orderId={order.id} />
        {order.status === "new" && <CancelOrderButton orderId={order.id} />}
        <Link href="/account" className={styles.btn + " " + styles.btnGhost}>← Все заказы</Link>
      </div>
    </main>
  );
}
