"use client";

import Link from "next/link";
import { useState } from "react";
import type { Order, OrderItem, Reservation } from "@/generated/prisma/client";
import { orderStatusLabel } from "@/lib/order-status";
import { adminListHref, orderListCounts, ORDER_STATUSES, ORDER_TYPES, type OrderListQuery } from "@/lib/admin-list-query";
import { OrderCard } from "./order-card";
import { AdminPagination } from "./admin-pagination";
import type { CatalogCategory, DeliveryOptionChoice, DeliveryZoneChoice } from "./order-editor-types";
import styles from "./admin-ui.module.css";
import { GuestContactActions } from "./guest-contact-actions";
import type { GuestChannels } from "@/lib/guest-contact";
import { PendingBookings } from "./pending-bookings";

type OrderWithItems = Order & { items: OrderItem[] };
const typeNames = { all: "Все типы", delivery: "Доставка", pickup: "Самовывоз" };
const rub = (value: number) => `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;

export function OrdersDashboard({ orders, counts, query, page, pageCount, catalog, deliveryOptions, deliveryZones, guestContact, upcomingBookings, canManageMenu }: { orders: OrderWithItems[]; counts: ReturnType<typeof orderListCounts>; query: OrderListQuery; page: number; pageCount: number; catalog: CatalogCategory[]; deliveryOptions: DeliveryOptionChoice[]; deliveryZones: DeliveryZoneChoice[]; guestContact: GuestChannels; upcomingBookings: Reservation[]; canManageMenu: boolean }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = orders.find((order) => order.id === selectedId) ?? orders[0];
  const href = (next: OrderListQuery) => adminListHref("/admin", next);

  return <div className={styles.dashboard}>
    <section className={styles.panel} aria-label="Список заказов">
      <div className={styles.panelTitle}><div><span className={styles.eyebrow}>Управление</span><h1>Заказы</h1></div><div className={styles.dashboardShortcuts}>{canManageMenu && <Link className={styles.sortButton} href="/admin/menu">Редактировать меню</Link>}<Link className={styles.sortButton} prefetch={false} href={href({ ...query, sort: query.sort === "desc" ? "asc" : "desc", page: 1 })}>{query.sort === "desc" ? "Сначала новые ↓" : "Сначала старые ↑"}</Link></div></div>
      <div className={styles.filters} role="group" aria-label="Фильтр заказов">{ORDER_STATUSES.map((status) => <Link key={status} prefetch={false} href={href({ ...query, status, page: 1 })} aria-current={query.status === status ? "page" : undefined}>{status === "all" ? "Все" : orderStatusLabel(status)} <span className={styles.count}>{counts.byStatus[status]}</span></Link>)}</div>
      <div className={styles.filters} role="group" aria-label="Тип заказа">{ORDER_TYPES.map((type) => <Link key={type} prefetch={false} href={href({ ...query, type, page: 1 })} aria-current={query.type === type ? "page" : undefined}>{typeNames[type]} <span className={styles.count}>{counts.byType[type]}</span></Link>)}</div>
      <div className={styles.list}>{orders.length ? orders.map((order) => <div className={styles.rowGroup} key={order.id}><button type="button" className={styles.row} aria-label={`Открыть заказ № ${order.number}`} aria-pressed={selected?.id === order.id} onClick={() => setSelectedId(order.id)}>
        <span><strong>№ {order.number}</strong><span className={`${styles.orderType} ${order.type === "delivery" ? styles.deliveryType : styles.pickupType}`}>{order.type === "delivery" ? "Доставка" : "Самовывоз"}</span></span>
        <span className={styles.rowMain}><strong>{order.customerName}</strong><small>{order.addressText || (order.type === "pickup" ? "Самовывоз" : "Адрес не указан")}</small><small>{order.createdAt.toLocaleString("ru-RU")}</small></span>
        <span><span className={styles.rowPrice}>{rub(order.total)}</span><small className={`${styles.badge} ${order.status === "new" ? styles.new : order.status === "cancelled" ? styles.cancelled : order.status === "delivered" || order.status === "issued" ? styles.done : ""}`}>{orderStatusLabel(order.status)}</small></span>
      </button><GuestContactActions phone={order.customerPhone} preferredChannel={order.preferredChannel} channels={guestContact} compact/></div>) : <p className={styles.empty}>Заказов по выбранным фильтрам пока нет.</p>}</div>
      <AdminPagination base="/admin" query={query} page={page} pageCount={pageCount} total={counts.total}/>
    </section>
    <section className={styles.panel} aria-label="Детали заказа">{selected ? <OrderCard key={`${selected.id}:${selected.updatedAt.toISOString()}`} order={selected} catalog={catalog} deliveryOptions={deliveryOptions} deliveryZones={deliveryZones} guestContact={guestContact}/> : <p className={styles.empty}>Выберите заказ из списка.</p>}</section>
    <PendingBookings bookings={upcomingBookings} guestContact={guestContact}/>
  </div>;
}
