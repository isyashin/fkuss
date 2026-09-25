"use client";

import Image from "next/image";
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
function statusTone(status: string) {
  return status === "new" ? styles.new : status === "ready" ? styles.ready : status === "cancelled" ? styles.cancelled
    : status === "delivered" || status === "issued" ? styles.done : styles.working;
}

export function OrderCard({ order, catalog, deliveryOptions, deliveryZones, guestContact, timeZone }: {
  order: Order & { items: OrderItem[] }; catalog: CatalogCategory[];
  deliveryOptions: DeliveryOptionChoice[]; deliveryZones: DeliveryZoneChoice[];
  guestContact: GuestChannels; timeZone: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<"items" | "info">("items");
  const editBlocked = orderEditBlockReason(order);
  const [editing, setEditing] = useState(!editBlocked);
  const [error, setError] = useState("");
  const actions = orderActionsFor(order.type, order.status);
  const dishes = new Map(catalog.flatMap((category) => category.dishes).map((dish) => [dish.id, dish]));
  const run = (status: string) => startTransition(async () => {
    setError("");
    try { await setOrderStatus(order.id, status); router.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось изменить статус"); }
  });
  const info = <div className={styles.orderInfo}>
    <div><span>Гость</span><strong>{order.customerName}</strong></div>
    <div><span>Связь</span><GuestContactActions phone={order.customerPhone} preferredChannel={order.preferredChannel} channels={guestContact}/></div>
    <div><span>Тип заказа</span><strong>{order.type === "delivery" ? "Доставка" : "Самовывоз"}</strong></div>
    {order.type === "delivery" && <div><span>Адрес</span><strong>{order.addressText || "Не указан"}</strong></div>}
    {order.desiredTime && <div><span>Время</span><strong>{order.desiredTime}</strong></div>}
    <div><span>Оплата</span><strong>{order.paymentMethod === "online" ? "Онлайн" : "При получении"}{order.paymentStatus === "paid" ? " · оплачено" : ""}</strong></div>
    <div><span>Комментарий</span><strong>{order.comment || "Нет комментария"}</strong></div>
  </div>;

  return <>
    <div className={styles.detailHeader}><div><span className={styles.eyebrow}>Детали заказа</span><div className={styles.detailTitle}><h2>Заказ № {order.number}</h2><span className={`${styles.badge} ${statusTone(order.status)}`}>{orderStatusLabel(order.status)}</span></div><p className={styles.muted}>{formatAdminDate(order.createdAt, timeZone)}</p></div></div>
    <div className={styles.tabs} role="tablist" aria-label="Детали заказа"><button type="button" role="tab" aria-selected={tab === "items"} onClick={() => setTab("items")}>Состав заказа</button><button type="button" role="tab" aria-selected={tab === "info"} onClick={() => setTab("info")}>Информация</button></div>
    {tab === "items" && (editing && !editBlocked ? <OrderEditor order={order} catalog={catalog} deliveryOptions={deliveryOptions} deliveryZones={deliveryZones} onClose={() => setEditing(false)}/> : <>
      <div className={styles.lineItems}>{order.items.map((item) => {
        const dish = dishes.get(item.dishId);
        const modifiers = (item.modifiers as { name?: string }[] | null) ?? [];
        return <div key={item.id} className={styles.lineItem}><div className={styles.linePhoto}>{dish?.image ? <Image src={dish.image} width={52} height={52} alt="" unoptimized/> : <span>Без фото</span>}</div><div className={styles.lineCopy}><strong>{item.name}</strong><small>{dish?.weight ? `${dish.weight} · ` : ""}{rub(item.price)} за шт.{modifiers.length ? ` · ${modifiers.map((modifier) => modifier.name).join(", ")}` : ""}</small></div><strong className={styles.linePrice}>{item.quantity} × {rub(item.total)}</strong></div>;
      })}</div>
      <div className={styles.totalRow}><span>Сумма блюд</span><strong>{rub(order.itemsTotal)}</strong></div>
      {order.deliveryPrice > 0 && <div className={styles.summaryLine}><span>Доставка</span><strong>{rub(order.deliveryPrice)}</strong></div>}
      {order.bonusSpent > 0 && <div className={styles.summaryLine}><span>Списано бонусов</span><strong>−{rub(order.bonusSpent)}</strong></div>}
      <div className={styles.summaryLine}><span>Итого</span><strong>{rub(order.total)}</strong></div>
      {!editBlocked && <button type="button" className={styles.addButton} onClick={() => setEditing(true)}>Изменить состав</button>}
      {editBlocked && <p className={styles.muted}>{editBlocked}</p>}
    </>)}
    {tab === "items" && <label className={styles.statusEditor}><span>Статус заказа</span><select value={order.status} disabled={pending || editing} onChange={(event) => run(event.target.value)}><option value={order.status}>{orderStatusLabel(order.status)}</option>{actions.map((action) => <option key={action.status} value={action.status}>{action.label}</option>)}</select>{editing && <small>Сначала сохраните изменения состава.</small>}</label>}
    {info}
    {error && <p className={styles.error} role="alert">{error}</p>}
  </>;
}
