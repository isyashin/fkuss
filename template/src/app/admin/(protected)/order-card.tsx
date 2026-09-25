"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Order, OrderItem } from "@/generated/prisma/client";
import { orderActionsFor, orderStatusLabel } from "@/lib/order-status";
import { orderEditBlockReason } from "@/lib/order-edit-policy";
import { setOrderStatus } from "./actions";
import { OrderEditor } from "./order-editor";
import type { CatalogCategory, DeliveryOptionChoice, DeliveryZoneChoice } from "./order-editor-types";
import styles from "./admin-ui.module.css";
import { GuestContactActions } from "./guest-contact-actions";
import type { GuestChannels } from "@/lib/guest-contact";
import { formatAdminDate } from "@/lib/admin-date";

const rub = (value: number) => `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className={styles.fact}><span>{label}</span><strong>{children}</strong></div>;
}

export function OrderCard({ order, catalog, deliveryOptions, deliveryZones, guestContact, timeZone }: { order: Order & { items: OrderItem[] }; catalog: CatalogCategory[]; deliveryOptions: DeliveryOptionChoice[]; deliveryZones: DeliveryZoneChoice[]; guestContact: GuestChannels; timeZone: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<"items" | "info">("items");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const actions = orderActionsFor(order.type, order.status);
  const editBlocked = orderEditBlockReason(order);
  const run = (status: string) => startTransition(async () => {
    setError("");
    try { await setOrderStatus(order.id, status); router.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось изменить статус"); }
  });

  return <>
    <div className={styles.detailHeader}><div><span className={styles.eyebrow}>Детали заказа</span><h2>Заказ № {order.number}</h2><p className={styles.muted}>{formatAdminDate(order.createdAt, timeZone)}</p></div><span className={`${styles.badge} ${order.status === "new" ? styles.new : order.status === "cancelled" ? styles.cancelled : order.status === "delivered" || order.status === "issued" ? styles.done : ""}`}>{orderStatusLabel(order.status)}</span></div>
    <div className={styles.tabs} role="tablist" aria-label="Детали заказа"><button type="button" role="tab" aria-selected={tab === "items"} onClick={() => setTab("items")}>Состав заказа</button><button type="button" role="tab" aria-selected={tab === "info"} onClick={() => setTab("info")}>Информация</button></div>
    {tab === "items" && !editing && <div className={styles.actions}><button type="button" disabled={Boolean(editBlocked) || pending} onClick={() => { setError(""); setEditing(true); }}>Изменить состав</button>{editBlocked && <span className={styles.muted}>{editBlocked}</span>}</div>}
    {tab === "items" && editing ? <OrderEditor order={order} catalog={catalog} deliveryOptions={deliveryOptions} deliveryZones={deliveryZones} onClose={() => setEditing(false)}/> : tab === "items" ? <>
      <div className={styles.items}>{order.items.map((item) => {
        const modifiers = (item.modifiers as { name?: string; price?: number }[] | null) ?? [];
        return <div key={item.id} className={styles.item}><div><strong>{item.name} × {item.quantity}</strong><small>{rub(item.price)} за шт.{modifiers.length ? ` · ${modifiers.map((modifier) => modifier.name).join(", ")}` : ""}</small></div><span className={styles.itemPrice}>{rub(item.total)}</span></div>;
      })}</div>
      <div className={styles.summary}><div className={styles.summaryLine}><span>Блюда</span><strong>{rub(order.itemsTotal)}</strong></div>{order.deliveryPrice > 0 && <div className={styles.summaryLine}><span>Доставка</span><strong>{rub(order.deliveryPrice)}</strong></div>}{order.bonusSpent > 0 && <div className={styles.summaryLine}><span>Списано бонусов</span><strong>−{rub(order.bonusSpent)}</strong></div>}<div className={`${styles.summaryLine} ${styles.summaryTotal}`}><span>Итого</span><strong>{rub(order.total)}</strong></div></div>
    </> : <div className={styles.facts}>
      <Fact label="Гость">{order.customerName}</Fact>
      <div className={styles.fact}><span>Связь</span><GuestContactActions phone={order.customerPhone} preferredChannel={order.preferredChannel} channels={guestContact}/></div>
      <Fact label="Тип">{order.type === "delivery" ? "Доставка" : "Самовывоз"}</Fact>
      {order.type === "delivery" && <Fact label="Адрес">{order.addressText || "Не указан"}</Fact>}
      {order.desiredTime && <Fact label="Время">{order.desiredTime}</Fact>}
      <Fact label="Оплата">{order.paymentMethod === "online" ? "Онлайн" : "При получении"}{order.paymentStatus === "paid" ? " · оплачено" : ""}</Fact>
      {order.comment && <Fact label="Комментарий">{order.comment}</Fact>}
    </div>}
    {actions.length > 0 && <div className={styles.actions}>{actions.map((action) => <button key={action.status} type="button" disabled={pending || editing} onClick={() => run(action.status)}>{action.label}</button>)}</div>}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </>;
}
