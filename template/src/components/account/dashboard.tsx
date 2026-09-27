import Link from "next/link";
import { getPrisma } from "@/lib/db";
import { getBonusBalance } from "@/lib/loyalty";
import { orderStatusLabel } from "@/lib/order-status";
import type { Customer } from "@/generated/prisma/client";
import { LogoutButton } from "./logout-button";
import { CancelBookingButton } from "./cancel-booking-button";
import { AddressSection } from "./address-section";
import { RepeatOrderButton } from "./repeat-order-button";
import { CancelOrderButton } from "./cancel-order-button";
import { ProfileForm } from "./profile-form";
import styles from "./account.module.css";

const BOOKING_STATUS: Record<string, string> = {
  new: "ожидает подтверждения",
  confirmed: "подтверждена",
  rejected: "отклонена",
  cancelled: "отменена",
};

const TX_LABEL: Record<string, string> = {
  accrual: "начисление",
  spend: "списание",
  reversal: "сторно",
  refund: "возврат",
};

const ORDERS_PER_PAGE = 8;

function orderBadgeClass(status: string): string {
  if (status === "cancelled") return styles.badgeRed;
  if (status === "new") return styles.badgeBlue;
  if (status === "delivered" || status === "issued") return styles.badgeGreen;
  return styles.badgeNeutral;
}

export async function AccountDashboard({ customer, ordersPage }: { customer: Customer; ordersPage: number }) {
  const prisma = getPrisma();
  const page = Math.max(1, ordersPage);
  const [ordersTotal, orders, bookings, balance, transactions, addresses] = await Promise.all([
    prisma.order.count({ where: { customerId: customer.id } }),
    prisma.order.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * ORDERS_PER_PAGE,
      take: ORDERS_PER_PAGE,
      include: { items: true },
    }),
    prisma.reservation.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    getBonusBalance(prisma, customer.id),
    prisma.bonusTransaction.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
    prisma.address.findMany({ where: { customerId: customer.id } }),
  ]);
  const pageCount = Math.max(1, Math.ceil(ordersTotal / ORDERS_PER_PAGE));

  return (
    <>
      <div className={styles.intro}>
        <span>Личный кабинет</span>
        <h1>Здравствуйте{customer.name ? `, ${customer.name}` : ""}!</h1>
        <p>Ваши заказы, бонусы, брони и адреса.</p>
      </div>

      <div className={styles.grid2} style={{ marginBottom: 14 }}>
        <div className={styles.panel}>
          <div className={styles.stat}>
            <div>
              <p className={styles.statLabel}>Бонусы</p>
              <p className={styles.statValue} data-testid="bonus-balance">{balance.toLocaleString("ru-RU")}</p>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            {transactions.length === 0 ? (
              <p className={styles.note}>Операций пока не было — бонусы начисляются после каждого выполненного заказа.</p>
            ) : (
              <ul className={styles.orderItems}>
                {transactions.map((tx) => (
                  <li key={tx.id}>
                    <span>
                      {new Date(tx.createdAt).toLocaleDateString("ru-RU")} · {TX_LABEL[tx.type] ?? tx.type}
                      {tx.comment ? ` · ${tx.comment}` : ""}
                    </span>
                    <span style={{ color: tx.amount >= 0 ? "#327051" : "#b3402f", fontWeight: 700 }}>
                      {tx.amount >= 0 ? "+" : ""}{tx.amount}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className={styles.panel}>
          <h2 className={styles.h2}>Профиль</h2>
          <p className={styles.hint}>Контакты используются в заказах и бронях.</p>
          <div className={styles.facts} style={{ marginTop: 0, marginBottom: 14 }}>
            <div className={styles.fact}><span>Email</span>{customer.email}</div>
            <div className={styles.fact}><span>Имя</span>{customer.name || "—"}</div>
            <div className={styles.fact}><span>Телефон</span>{customer.phone || "—"}</div>
          </div>
          <ProfileForm initialName={customer.name} initialPhone={customer.phone} />
        </div>
      </div>

      <div className={styles.panel} style={{ marginBottom: 14 }}>
        <h2 className={styles.h2}>История заказов</h2>
        <p className={styles.hint}>Всего {ordersTotal}. Клик по заказу — детали.</p>
        {orders.length === 0 ? (
          <p className={styles.note}>Пока пусто. <Link href="/#menu" style={{ color: "var(--accent)" }}>Перейти в меню</Link></p>
        ) : (
          <>
            <div className={styles.rows}>
              {orders.map((order) => (
                <div key={order.id} className={styles.row}>
                  <div className={styles.rowMain} style={{ flex: 1 }}>
                    <span>
                      <Link href={`/account/orders/${order.id}`} className={styles.rowLink} style={{ fontWeight: 700 }}>
                        Заказ №{order.number}
                      </Link>{" "}
                      <span className={styles.badge + " " + orderBadgeClass(order.status)}>
                        {orderStatusLabel(order.status)}
                      </span>
                    </span>
                    <small>
                      {order.createdAt.toLocaleString("ru-RU")} · {order.type === "delivery" ? "доставка" : "самовывоз"}
                      {order.bonusAccrued > 0 && ` · +${order.bonusAccrued} бонусов`}
                    </small>
                    <small>{order.items.map((i) => `${i.name} ×${i.quantity}`).join(", ")}</small>
                  </div>
                  <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
                    <strong>{order.total.toLocaleString("ru-RU")} ₽</strong>
                    <div style={{ display: "flex", gap: 6 }}>
                      <RepeatOrderButton orderId={order.id} />
                      {order.status === "new" && <CancelOrderButton orderId={order.id} />}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {pageCount > 1 && (
              <nav className={styles.pager} aria-label="Страницы заказов">
                {page > 1 && <Link href={`/account?ordersPage=${page - 1}`}>← Назад</Link>}
                <span>{page} / {pageCount}</span>
                {page < pageCount && <Link href={`/account?ordersPage=${page + 1}`}>Вперёд →</Link>}
              </nav>
            )}
          </>
        )}
      </div>

      <div className={styles.grid2}>
        <div className={styles.panel}>
          <h2 className={styles.h2}>Мои брони</h2>
          <p className={styles.hint}>Бронирование столов в ресторане.</p>
          {bookings.length === 0 ? (
            <p className={styles.note}>Броней нет. <Link href="/booking" style={{ color: "var(--accent)" }}>Забронировать</Link></p>
          ) : (
            <div className={styles.rows}>
              {bookings.map((b) => (
                <div key={b.id} className={styles.row}>
                  <div className={styles.rowMain}>
                    <span>{b.date} в {b.time} · {b.guests} гостей</span>
                    <small>{BOOKING_STATUS[b.status] ?? b.status}</small>
                  </div>
                  {["new", "confirmed"].includes(b.status) && <CancelBookingButton id={b.id} />}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.panel}>
          <h2 className={styles.h2}>Адреса доставки</h2>
          <p className={styles.hint}>Сохранённые адреса подставляются при оформлении.</p>
          <AddressSection addresses={addresses} />
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <LogoutButton />
      </div>
    </>
  );
}
