"use client";

import Link from "next/link";
import { useState } from "react";
import type { Order, OrderItem } from "@/generated/prisma/client";
import { orderStatusLabel } from "@/lib/order-status";
import { adminListHref, orderListCounts, ORDER_MODES, ORDER_TYPES, type OrderListQuery } from "@/lib/admin-list-query";
import { OrderCard } from "./order-card";
import { AdminPagination } from "./admin-pagination";
import { AdminIcon } from "./admin-icon";
import type { CatalogCategory, DeliveryOptionChoice, DeliveryZoneChoice } from "./order-editor-types";
import styles from "./admin-ui.module.css";
import { GuestContactActions } from "./guest-contact-actions";
import type { GuestChannels } from "@/lib/guest-contact";

type OrderWithItems = Order & { items: OrderItem[] };
const typeNames = { all: "Все типы", delivery: "Доставка", pickup: "Самовывоз" };
// Рабочие очереди по макету: «Текущие», «Новые», «История» (без «Все»).
const QUEUE_MODES = ORDER_MODES.filter((mode) => mode !== "all");
const rub = (value: number) => `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
function orderTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("ru-RU", { timeZone, hour: "2-digit", minute: "2-digit" }).format(date);
}
function statusTone(status: string) {
  return status === "new" ? styles.new : status === "ready" ? styles.ready : status === "cancelled" ? styles.cancelled
    : status === "delivered" || status === "issued" ? styles.done : styles.working;
}

export function OrdersDashboard({ orders, counts, query, page, pageCount, catalog, deliveryOptions, deliveryZones, guestContact, timeZone }: {
  orders: OrderWithItems[]; counts: ReturnType<typeof orderListCounts>; query: OrderListQuery; page: number; pageCount: number;
  catalog: CatalogCategory[]; deliveryOptions: DeliveryOptionChoice[]; deliveryZones: DeliveryZoneChoice[];
  guestContact: GuestChannels; canManageMenu: boolean; timeZone: string;
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
      <form className={styles.search} role="search" action="/admin" method="get" key={`${query.mode}|${query.type}|${query.sort}|${query.q}`}>
        {query.mode !== "all" && <input type="hidden" name="mode" value={query.mode} />}
        {query.type !== "all" && <input type="hidden" name="type" value={query.type} />}
        {query.sort !== "desc" && <input type="hidden" name="sort" value={query.sort} />}
        <input className={styles.searchInput} type="search" name="q" defaultValue={query.q} placeholder="Номер, имя или телефон" maxLength={60} aria-label="Поиск заказа" />
        <button type="submit" className={styles.searchButton}>Найти</button>
        {query.q && <Link className={styles.searchReset} href={href({ ...query, q: "", page: 1 })}>Сбросить</Link>}
      </form>
      <div className={styles.filters} role="group" aria-label="Режим очереди заказов">
        {QUEUE_MODES.map((mode) => <Link key={mode} prefetch={false} href={href({ ...query, mode, page: 1 })} aria-current={query.mode === mode ? "page" : undefined}>{mode === "current" ? "Текущие" : mode === "new" ? "Новые" : "История"} <span className={styles.count}>{counts.byMode[mode]}</span></Link>)}
      </div>
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
  </div>;
}
