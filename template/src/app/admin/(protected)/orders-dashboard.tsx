"use client";

import Link from "next/link";
import { useState } from "react";
import type { Order, OrderItem, Reservation } from "@/generated/prisma/client";
import { orderStatusLabel } from "@/lib/order-status";
import { adminListHref, orderListCounts, ORDER_STATUSES, ORDER_TYPES, type OrderListQuery } from "@/lib/admin-list-query";
import { OrderCard } from "./order-card";
import { AdminPagination } from "./admin-pagination";
import { AdminIcon } from "./admin-icon";
import type { CatalogCategory, DeliveryOptionChoice, DeliveryZoneChoice } from "./order-editor-types";
import styles from "./admin-ui.module.css";
import { GuestContactActions } from "./guest-contact-actions";
import type { GuestChannels } from "@/lib/guest-contact";
import { PendingBookings } from "./pending-bookings";

type OrderWithItems = Order & { items: OrderItem[] };
const typeNames = { all: "Все типы", delivery: "Доставка", pickup: "Самовывоз" };
const rub = (value: number) => `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
function orderTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("ru-RU", { timeZone, hour: "2-digit", minute: "2-digit" }).format(date);
}
function statusTone(status: string) {
  return status === "new" ? styles.new : status === "ready" ? styles.ready : status === "cancelled" ? styles.cancelled
    : status === "delivered" || status === "issued" ? styles.done : styles.working;
}

export function OrdersDashboard({ orders, counts, query, page, pageCount, catalog, deliveryOptions, deliveryZones, guestContact, upcomingBookings, timeZone }: {
  orders: OrderWithItems[]; counts: ReturnType<typeof orderListCounts>; query: OrderListQuery; page: number; pageCount: number;
  catalog: CatalogCategory[]; deliveryOptions: DeliveryOptionChoice[]; deliveryZones: DeliveryZoneChoice[];
  guestContact: GuestChannels; upcomingBookings: Reservation[]; canManageMenu: boolean; timeZone: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = orders.find((order) => order.id === selectedId) ?? orders[0];
  const href = (next: OrderListQuery) => adminListHref("/admin", next);

  return <div className={styles.dashboard}>
    <section className={`${styles.panel} ${styles.ordersPanel}`} aria-label="Список заказов">
      <div className={styles.panelTitle}><div><span className={styles.eyebrow}>Управление</span><h1>Заказы</h1></div>
        <div className={styles.dashboardShortcuts}>
          <details className={styles.typeFilter}><summary>{typeNames[query.type]}</summary><div>{ORDER_TYPES.map((type) => <Link key={type} href={href({ ...query, type, page: 1 })} aria-current={query.type === type ? "page" : undefined}>{typeNames[type]}</Link>)}</div></details>
          <Link className={styles.sortButton} prefetch={false} href={href({ ...query, sort: query.sort === "desc" ? "asc" : "desc", page: 1 })}>По времени · {query.sort === "desc" ? "сначала новые" : "сначала старые"} <span>⌄</span></Link>
        </div>
      </div>
      <div className={styles.filters} role="group" aria-label="Фильтр заказов">{ORDER_STATUSES.map((status) => <Link key={status} prefetch={false} href={href({ ...query, status, page: 1 })} aria-current={query.status === status ? "page" : undefined}>{status === "all" ? "Все" : orderStatusLabel(status)} <span className={styles.count}>{counts.byStatus[status]}</span></Link>)}</div>
      <div className={styles.list}>{orders.length ? orders.map((order) => <div className={`${styles.orderPreview} ${order.type === "delivery" ? styles.deliveryPreview : styles.pickupPreview} ${selected?.id === order.id ? styles.selectedPreview : ""}`} key={order.id}>
        <button type="button" className={styles.orderOpen} aria-label={`Открыть заказ № ${order.number}`} aria-pressed={selected?.id === order.id} onClick={() => setSelectedId(order.id)}/>
        <div className={styles.orderLead}><span className={`${styles.orderType} ${order.type === "delivery" ? styles.deliveryType : styles.pickupType}`}>{order.type === "delivery" ? "Доставка" : "Самовывоз"}</span><span className={styles.orderMeta}><strong>№ {order.number}</strong><small>{orderTime(order.createdAt, timeZone)}</small></span></div>
        <div className={styles.orderGuest}><strong>{order.customerName}</strong><small>{order.addressText || (order.type === "pickup" ? "Самовывоз" : "Адрес не указан")}</small><GuestContactActions phone={order.customerPhone} preferredChannel={order.preferredChannel} channels={guestContact} compact/></div>
        <div className={styles.orderSummary}><strong>{rub(order.total)}</strong><span className={`${styles.badge} ${statusTone(order.status)}`}>{orderStatusLabel(order.status)}</span></div>
        <AdminIcon name="chevron" size={17}/>
      </div>) : <p className={styles.empty}>Заказов по выбранным фильтрам пока нет.</p>}</div>
      <AdminPagination base="/admin" query={query} page={page} pageCount={pageCount} total={counts.total}/>
    </section>
    <section className={`${styles.panel} ${styles.detailPanel}`} aria-label="Детали заказа">{selected ? <OrderCard key={`${selected.id}:${selected.updatedAt.toISOString()}`} order={selected} catalog={catalog} deliveryOptions={deliveryOptions} deliveryZones={deliveryZones} guestContact={guestContact} timeZone={timeZone}/> : <p className={styles.empty}>Выберите заказ из списка.</p>}</section>
    <PendingBookings bookings={upcomingBookings} guestContact={guestContact}/>
  </div>;
}
