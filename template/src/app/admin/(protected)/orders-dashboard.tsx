"use client";

import Link from "next/link";
import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Order, OrderItem } from "@/generated/prisma/client";
import { orderActionsFor, orderStatusLabel } from "@/lib/order-status";
import { adminListHref, orderListCounts, ORDER_MODES, ORDER_TYPES, type OrderListQuery } from "@/lib/admin-list-query";
import { OrderCard } from "./order-card";
import { AdminPagination } from "./admin-pagination";
import { StatusPill } from "./status-pill";
import { setOrderStatus } from "./actions";
import { confirmDiscard } from "./admin-dirty";
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

/** D05: позиция списка — в модульном состоянии (без ref внутри компонента:
    react-hooks/refs запрещает чтение ref'ов даже в обработчиках JSX). */
let savedListPosition = { win: 0, pane: 0 };
function ordersPaneElement(): HTMLElement | null {
  return document.querySelector('section[aria-label="Список заказов"]');
}
function saveListPosition() {
  savedListPosition = { win: window.scrollY, pane: ordersPaneElement()?.scrollTop ?? 0 };
}
function restoreListPosition() {
  for (const delay of [80, 250, 500, 900]) {
    setTimeout(() => {
      window.scrollTo(0, savedListPosition.win);
      const pane = ordersPaneElement();
      if (pane) pane.scrollTop = savedListPosition.pane;
    }, delay);
  }
}

export function OrdersDashboard({ orders, counts, query, page, pageCount, catalog, deliveryOptions, deliveryZones, guestContact, timeZone, initialSelectedId, selectedOrder }: {
  orders: OrderWithItems[]; counts: ReturnType<typeof orderListCounts>; query: OrderListQuery; page: number; pageCount: number;
  catalog: CatalogCategory[]; deliveryOptions: DeliveryOptionChoice[]; deliveryZones: DeliveryZoneChoice[];
  guestContact: GuestChannels; canManageMenu: boolean; timeZone: string;
  initialSelectedId?: string | null; selectedOrder?: OrderWithItems | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null);
  // F10: прямая ссылка ?selected= на телефоне сразу открывает деталь вместо списка.
  const [mobileDetail, setMobileDetail] = useState(() => Boolean(initialSelectedId));
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const router = useRouter();
  const [quickPending, startQuickTransition] = useTransition();
  // D05: «проваливание» в деталь сохраняет позицию списка, возврат — восстанавливает.
  // Быстрое действие на карточке — тот же допустимый переход, что кнопка в детали.
  const quickAdvance = (orderId: string, status: string) => startQuickTransition(async () => {
    try { await setOrderStatus(orderId, status); router.refresh(); } catch { /* деталь показывает причину */ }
  });
  // Выбор в URL переживает reload; системная Back закрывает полноэкранный слой
  // и синхронизирует выбранный заказ с адресом (F10).
  useEffect(() => {
    const onPopState = () => {
      setMobileDetail(false);
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get("selected");
      setSelectedId(fromUrl && fromUrl.length <= 100 ? fromUrl : null);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  const selected = (selectedId ? orders.find((order) => order.id === selectedId) ?? (selectedOrder?.id === selectedId ? selectedOrder : null) : null) ?? orders[0] ?? null;
  const href = (next: OrderListQuery) => adminListHref("/admin", next);
  // Открытие заказа с защитой черновика: при правке состава спрашиваем про потерю.
  const openOrder = (id: string) => {
    void confirmDiscard("Изменения состава заказа не сохранятся.").then((proceed) => {
      if (!proceed) return;
      setSelectedId(id);
      setMobileDetail(true);
      window.scrollTo(0, 0);
      const isMobile = window.matchMedia("(max-width: 760px)").matches;
      if (isMobile) {
        const base = href(query);
        window.history.pushState({ orderDetail: id }, "", `${base}${base.includes("?") ? "&" : "?"}selected=${encodeURIComponent(id)}`);
      } else {
        const base = href(query);
        router.replace(`${base}${base.includes("?") ? "&" : "?"}selected=${encodeURIComponent(id)}`, { scroll: false });
      }
    });
  };
  const closeDetail = () => {
    // Если слой открыт через pushState — возврат системной кнопкой сохранит контекст списка.
    if (window.history.state?.orderDetail) window.history.back();
    else setMobileDetail(false);
    restoreListPosition();
  };
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
      {/* F19: вкладки с клавиатурной навигацией (стрелки, Home, End) */}
      <div
        className={styles.filters}
        role="tablist"
        aria-label="Режим очереди заказов"
        onKeyDown={(event) => {
          const tabs = [...event.currentTarget.querySelectorAll<HTMLAnchorElement>('[role="tab"]')];
          const current = tabs.indexOf(document.activeElement as HTMLAnchorElement);
          if (current < 0) return;
          const next = event.key === "ArrowRight" ? (current + 1) % tabs.length
            : event.key === "ArrowLeft" ? (current - 1 + tabs.length) % tabs.length
            : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
          if (next < 0) return;
          event.preventDefault();
          tabs[next].focus();
          tabs[next].click();
        }}
      >
        {QUEUE_MODES.map((mode) => <Link key={mode} prefetch={false} role="tab" tabIndex={query.mode === mode ? 0 : -1} aria-selected={query.mode === mode} href={href({ ...query, mode, page: 1 })} aria-current={query.mode === mode ? "page" : undefined}>{mode === "current" ? "Текущие" : mode === "new" ? "Новые" : "История"} <span className={styles.count}>{counts.byMode[mode]}</span></Link>)}
      </div>
      <form key={`${query.mode}|${query.sort}|${query.q}`} className={styles.queueTools} role="search" action="/admin" method="get">
        {query.mode !== "all" && query.mode !== "current" && <input type="hidden" name="mode" value={query.mode} />}
        {query.sort !== "desc" && <input type="hidden" name="sort" value={query.sort} />}
        <input className={styles.searchInput} type="search" name="q" defaultValue={query.q} placeholder="№, имя или телефон" maxLength={60} aria-label="Поиск заказа" />
        <button type="submit" className={styles.searchButton}>Найти</button>
        <select name="type" defaultValue={query.type} aria-label="Тип заказа" onChange={(event) => event.currentTarget.form?.requestSubmit()}>
          {ORDER_TYPES.map((type) => <option key={type} value={type}>{typeNames[type]}</option>)}
        </select>
        {query.q && <Link className={styles.searchReset} href={href({ ...query, q: "", page: 1 })}>Сбросить поиск</Link>}
      </form>
      <div className={styles.list}>{!orders.length && <p className={styles.empty}>Заказов по этим условиям нет.</p>}
        <div className={styles.ordersDesktopList}>
          {orders.length ? orders.map((order) => <div className={`${styles.orderPreview} ${selected?.id === order.id ? styles.selectedPreview : ""}`} key={order.id}>
            <button type="button" className={styles.orderOpen} aria-label={`Открыть заказ № ${order.number}`} aria-pressed={selected?.id === order.id} onClick={() => { saveListPosition(); openOrder(order.id); }}/>
            <span className={styles.rowTop}><span><strong>№ {order.number}</strong><time>{orderTime(order.createdAt, timeZone)}</time></span><StatusPill tone={statusTone(order.status)}>{orderStatusLabel(order.status)}</StatusPill></span>
            <span className={styles.rowPerson}>{order.customerName}</span>
            <span className={styles.rowBottom}><span>{order.type === "delivery" ? "Доставка" : "Самовывоз"} · {order.desiredTime ? `к ${order.desiredTime}` : "как можно скорее"}</span><b>{rub(order.total)}</b></span>
          </div>) : null}
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
                          onClick={() => { saveListPosition(); openOrder(order.id); }}>
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
          }) : null}
        </div>
      </div>
      <AdminPagination base="/admin" query={query} page={page} pageCount={pageCount} total={counts.total}/>
    </section>
    <section className={styles.detailPanel} aria-label="Детали заказа">{selected ? <OrderCard key={`${selected.id}:${selected.updatedAt.toISOString()}`} order={selected} catalog={catalog} deliveryOptions={deliveryOptions} deliveryZones={deliveryZones} guestContact={guestContact} timeZone={timeZone} onBack={closeDetail}/> : <div className={styles.detailInner}><p className={styles.empty}>Выберите заказ.</p></div>}</section>
  </div>;
}
