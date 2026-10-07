"use client";

import Link from "next/link";
import { useState } from "react";
import type { Order, OrderItem } from "@/generated/prisma/client";
import { orderStatusLabel } from "@/lib/order-status";
import { adminListHref, orderListCounts, ORDER_MODES, ORDER_TYPES, type OrderListQuery } from "@/lib/admin-list-query";
import { OrderCard } from "./order-card";
import { AdminPagination } from "./admin-pagination";
import { StatusPill } from "./status-pill";
import type { CatalogCategory, DeliveryOptionChoice, DeliveryZoneChoice } from "./order-editor-types";
import styles from "./admin-ui.module.css";
import type { GuestChannels } from "@/lib/guest-contact";

type OrderWithItems = Order & { items: OrderItem[] };
// Рабочие очереди по макету: «Текущие», «Новые», «История» (без «Все»).
const QUEUE_MODES = ORDER_MODES.filter((mode) => mode !== "all");
const typeNames = { all: "Все типы", delivery: "Доставка", pickup: "Самовывоз" };
const rub = (value: number) => `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
function orderTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("ru-RU", { timeZone, hour: "2-digit", minute: "2-digit" }).format(date);
}
function statusTone(status: string): "new" | "success" | "danger" | "warn" {
  if (status === "new") return "new";
  if (status === "cancelled") return "danger";
  if (status === "ready" || status === "delivered" || status === "issued") return "success";
  return "warn";
}

export function OrdersDashboard({ orders, counts, query, page, pageCount, catalog, deliveryOptions, deliveryZones, guestContact, timeZone }: {
  orders: OrderWithItems[]; counts: ReturnType<typeof orderListCounts>; query: OrderListQuery; page: number; pageCount: number;
  catalog: CatalogCategory[]; deliveryOptions: DeliveryOptionChoice[]; deliveryZones: DeliveryZoneChoice[];
  guestContact: GuestChannels; canManageMenu: boolean; timeZone: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const selected = orders.find((order) => order.id === selectedId) ?? orders[0];
  const href = (next: OrderListQuery) => adminListHref("/admin", next);

  return <div className={`${styles.dashboard} ${mobileDetail ? styles.mobileDetail : ""}`}>
    <section className={styles.ordersPanel} aria-label="Список заказов">
      <div className={styles.queueHead}><h1>Заказы</h1></div>
      <div className={styles.filters} role="group" aria-label="Режим очереди заказов">
        {QUEUE_MODES.map((mode) => <Link key={mode} prefetch={false} href={href({ ...query, mode, page: 1 })} aria-current={query.mode === mode ? "page" : undefined}>{mode === "current" ? "Текущие" : mode === "new" ? "Новые" : "История"} <span className={styles.count}>{counts.byMode[mode]}</span></Link>)}
      </div>
      <form key={`${formKey}|${query.mode}|${query.sort}|${query.q}`} className={styles.queueTools} role="search" action="/admin" method="get" onSubmit={() => setFormKey((key) => key + 1)}>
        {query.mode !== "all" && query.mode !== "current" && <input type="hidden" name="mode" value={query.mode} />}
        {query.sort !== "desc" && <input type="hidden" name="sort" value={query.sort} />}
        <input className={styles.searchInput} type="search" name="q" defaultValue={query.q} placeholder="№, имя или телефон" maxLength={60} aria-label="Поиск заказа" />
        <select name="type" defaultValue={query.type} aria-label="Тип заказа" onChange={(event) => event.currentTarget.form?.requestSubmit()}>
          {ORDER_TYPES.map((type) => <option key={type} value={type}>{typeNames[type]}</option>)}
        </select>
        {query.q && <Link className={styles.searchReset} href={href({ ...query, q: "", page: 1 })}>Сбросить поиск</Link>}
      </form>
      <div className={styles.list}>{orders.length ? orders.map((order) => <div className={`${styles.orderPreview} ${selected?.id === order.id ? styles.selectedPreview : ""}`} key={order.id}>
        <button type="button" className={styles.orderOpen} aria-label={`Открыть заказ № ${order.number}`} aria-pressed={selected?.id === order.id} onClick={() => { setSelectedId(order.id); setMobileDetail(true); }}/>
        <span className={styles.rowTop}><span><strong>№ {order.number}</strong><time>{orderTime(order.createdAt, timeZone)}</time></span><StatusPill tone={statusTone(order.status)}>{orderStatusLabel(order.status)}</StatusPill></span>
        <span className={styles.rowPerson}>{order.customerName}</span>
        <span className={styles.rowBottom}><span>{order.type === "delivery" ? "Доставка" : "Самовывоз"} · {order.desiredTime ? `к ${order.desiredTime}` : "как можно скорее"}</span><b>{rub(order.total)}</b></span>
      </div>) : <p className={styles.empty}>Заказов по этим условиям нет.</p>}</div>
      <AdminPagination base="/admin" query={query} page={page} pageCount={pageCount} total={counts.total}/>
    </section>
    <section className={styles.detailPanel} aria-label="Детали заказа">{selected ? <OrderCard key={`${selected.id}:${selected.updatedAt.toISOString()}`} order={selected} catalog={catalog} deliveryOptions={deliveryOptions} deliveryZones={deliveryZones} guestContact={guestContact} timeZone={timeZone} onBack={() => setMobileDetail(false)}/> : <div className={styles.detailInner}><p className={styles.empty}>Выберите заказ.</p></div>}</section>
  </div>;
}
