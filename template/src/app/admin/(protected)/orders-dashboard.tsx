"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Order, OrderItem } from "@/generated/prisma/client";
import { orderActionsFor, orderStatusLabel } from "@/lib/order-status";
import { adminListHref, orderListCounts, ORDER_MODES, ORDER_TYPES, type OrderListQuery } from "@/lib/admin-list-query";
import { OrderCard } from "./order-card";
import { AdminPagination } from "./admin-pagination";
import { StatusPill } from "./status-pill";
import { setOrderStatus } from "./actions";
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
const dishWord = (count: number) => { const form = new Intl.PluralRules("ru-RU").select(count); return form === "one" ? "блюдо" : form === "few" ? "блюда" : "блюд"; };

export function OrdersDashboard({ orders, counts, query, page, pageCount, catalog, deliveryOptions, deliveryZones, guestContact, timeZone }: {
  orders: OrderWithItems[]; counts: ReturnType<typeof orderListCounts>; query: OrderListQuery; page: number; pageCount: number;
  catalog: CatalogCategory[]; deliveryOptions: DeliveryOptionChoice[]; deliveryZones: DeliveryZoneChoice[];
  guestContact: GuestChannels; canManageMenu: boolean; timeZone: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [formKey, setFormKey] = useState(0);
  const router = useRouter();
  const [quickPending, startQuickTransition] = useTransition();
  // Быстрое действие на карточке — тот же допустимый переход, что кнопка в детали.
  const quickAdvance = (orderId: string, status: string) => startQuickTransition(async () => {
    try { await setOrderStatus(orderId, status); router.refresh(); } catch { /* деталь показывает причину */ }
  });
  const selected = orders.find((order) => order.id === selectedId) ?? orders[0];
  const href = (next: OrderListQuery) => adminListHref("/admin", next);
  const toggleGroup = (key: string) => setCollapsedGroups((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  // Мобильные группы по рабочему этапу (макет): пустые не показываются.
  const mobileGroups: { key: string; label: string; match: (order: OrderWithItems) => boolean }[] = query.mode === "history"
    ? [
        { key: "done", label: "Выполнены", match: (order) => ["delivered", "issued"].includes(order.status) },
        { key: "cancelled", label: "Отменённые", match: (order) => order.status === "cancelled" },
      ]
    : [
        { key: "new", label: "Новые", match: (order) => order.status === "new" },
        { key: "accepted", label: "Приняты", match: (order) => order.status === "accepted" },
        { key: "cooking", label: "Готовятся", match: (order) => order.status === "cooking" },
        { key: "ready", label: "Ждут выдачи", match: (order) => order.status === "ready" },
        { key: "courier", label: "Переданы курьеру", match: (order) => order.status === "handed_to_courier" },
        // Режим «Все» (прямая ссылка): финальные статусы тоже показываем.
        ...(query.mode === "all"
          ? [
              { key: "done", label: "Выполнены", match: (order: OrderWithItems) => ["delivered", "issued"].includes(order.status) },
              { key: "cancelled", label: "Отменённые", match: (order: OrderWithItems) => order.status === "cancelled" },
            ]
          : []),
      ];

  return <div className={`${styles.dashboard} ${mobileDetail ? styles.mobileDetail : ""}`} data-order-detail-open={mobileDetail ? "" : undefined}>
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
      <div className={styles.list}>
        <div className={styles.ordersDesktopList}>
          {orders.length ? orders.map((order) => <div className={`${styles.orderPreview} ${selected?.id === order.id ? styles.selectedPreview : ""}`} key={order.id}>
            <button type="button" className={styles.orderOpen} aria-label={`Открыть заказ № ${order.number}`} aria-pressed={selected?.id === order.id} onClick={() => { setSelectedId(order.id); setMobileDetail(true); }}/>
            <span className={styles.rowTop}><span><strong>№ {order.number}</strong><time>{orderTime(order.createdAt, timeZone)}</time></span><StatusPill tone={statusTone(order.status)}>{orderStatusLabel(order.status)}</StatusPill></span>
            <span className={styles.rowPerson}>{order.customerName}</span>
            <span className={styles.rowBottom}><span>{order.type === "delivery" ? "Доставка" : "Самовывоз"} · {order.desiredTime ? `к ${order.desiredTime}` : "как можно скорее"}</span><b>{rub(order.total)}</b></span>
          </div>) : <p className={styles.empty}>Заказов по этим условиям нет.</p>}
        </div>
        <div className={styles.ordersMobileList}>
          {orders.length ? mobileGroups.map((group) => {
            const items = orders.filter(group.match);
            if (!items.length) return null;
            const collapsed = collapsedGroups.has(group.key);
            return (
              <section key={group.key} className={styles.orderGroup} aria-label={group.label}>
                <button type="button" className={styles.orderGroupToggle} aria-expanded={!collapsed} aria-controls={`order-group-${group.key}`} onClick={() => toggleGroup(group.key)}>
                  <span>{group.label}</span><span className={styles.orderGroupCount}>{items.length}</span>
                </button>
                <div id={`order-group-${group.key}`} hidden={collapsed}>
                  {items.map((order) => {
                    const next = orderActionsFor(order.type, order.status)[0];
                    const quick = next && (order.status === "new" || order.status === "ready");
                    const count = order.items.reduce((sum, item) => sum + item.quantity, 0);
                    return (
                      <article key={order.id} className={`${styles.orderMobileCard} ${order.status === "new" ? styles.orderMobileCardNew : ""}`}>
                        <button type="button" className={styles.orderCardOpen} aria-current={selected?.id === order.id}
                          aria-label={`Открыть заказ № ${order.number}, ${rub(order.total)}, ${count} ${dishWord(count)}, ${order.type === "delivery" ? "доставка" : "самовывоз"}${order.desiredTime ? ` к ${order.desiredTime}` : ""}`}
                          onClick={() => { setSelectedId(order.id); setMobileDetail(true); }}>
                          <span className={styles.orderCardTop}><strong>№ {order.number}</strong><time>{orderTime(order.createdAt, timeZone)}</time></span>
                          <span className={styles.orderCardMeta}>{rub(order.total)} · {count} {dishWord(count)}</span>
                          <span className={styles.orderCardRoute}>{order.type === "delivery" ? "Доставка" : "Самовывоз"}{order.desiredTime ? ` · к ${order.desiredTime}` : ""}</span>
                        </button>
                        {quick && next && <button type="button" className={styles.orderCardAction} disabled={quickPending} onClick={() => quickAdvance(order.id, next.status)}>{next.label}</button>}
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          }) : <p className={styles.empty}>Заказов по этим условиям нет.</p>}
        </div>
      </div>
      <AdminPagination base="/admin" query={query} page={page} pageCount={pageCount} total={counts.total}/>
    </section>
    <section className={styles.detailPanel} aria-label="Детали заказа">{selected ? <OrderCard key={`${selected.id}:${selected.updatedAt.toISOString()}`} order={selected} catalog={catalog} deliveryOptions={deliveryOptions} deliveryZones={deliveryZones} guestContact={guestContact} timeZone={timeZone} onBack={() => setMobileDetail(false)}/> : <div className={styles.detailInner}><p className={styles.empty}>Выберите заказ.</p></div>}</section>
  </div>;
}
