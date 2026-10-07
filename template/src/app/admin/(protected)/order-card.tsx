"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Order, OrderItem } from "@/generated/prisma/client";
import { orderActionsFor, orderStatusLabel } from "@/lib/order-status";
import { orderEditBlockReason } from "@/lib/order-edit-policy";
import { setOrderStatus } from "./actions";
import { OrderEditor } from "./order-editor";
import { StatusPill } from "./status-pill";
import { ConfirmDialog } from "./confirm-dialog";
import type { CatalogCategory, DeliveryOptionChoice, DeliveryZoneChoice } from "./order-editor-types";
import styles from "./admin-ui.module.css";
import { GuestContactActions } from "./guest-contact-actions";
import type { GuestChannels } from "@/lib/guest-contact";
import { formatAdminDate } from "@/lib/admin-date";

const rub = (value: number) => `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;
function statusTone(status: string): "new" | "success" | "danger" | "warn" {
  if (status === "new") return "new";
  if (status === "cancelled") return "danger";
  if (status === "ready" || status === "delivered" || status === "issued") return "success";
  return "warn";
}

export function OrderCard({ order, catalog, deliveryOptions, deliveryZones, guestContact, timeZone, onBack }: {
  order: Order & { items: OrderItem[] }; catalog: CatalogCategory[];
  deliveryOptions: DeliveryOptionChoice[]; deliveryZones: DeliveryZoneChoice[];
  guestContact: GuestChannels; timeZone: string; onBack: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const editBlocked = orderEditBlockReason(order);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const actions = orderActionsFor(order.type, order.status);
  const forward = actions.filter((action) => action.status !== "cancelled");
  const cancel = actions.find((action) => action.status === "cancelled");
  const next = forward[0];
  const dishes = new Map(catalog.flatMap((category) => category.dishes).map((dish) => [dish.id, dish]));
  const run = (status: string) => startTransition(async () => {
    setError("");
    try { await setOrderStatus(order.id, status); router.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось изменить статус"); }
  });

  return <div className={styles.detailInner}>
    <div className={styles.orderDetailBar}>
      <button type="button" className={styles.backButton} onClick={onBack} aria-label="Назад к заказам">←</button>
      <strong tabIndex={-1}>{editing ? `Состав заказа № ${order.number}` : `Заказ № ${order.number}`}</strong>
    </div>
    <div className={styles.detailHeader}>
      <div className={styles.detailTitle}><h2>Заказ № {order.number}</h2><StatusPill tone={statusTone(order.status)}>{orderStatusLabel(order.status)}</StatusPill></div>
      <p className={styles.muted}>{order.type === "delivery" ? "Доставка" : "Самовывоз"} · {formatAdminDate(order.createdAt, timeZone)}</p>
      {(() => {
        const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
        return <p className={styles.orderMobileSummary}><strong>{rub(order.total)}</strong><span>{itemCount} {itemCount === 1 ? "блюдо" : itemCount >= 2 && itemCount <= 4 ? "блюда" : "блюд"}{order.desiredTime ? ` · к ${order.desiredTime}` : ""}</span></p>;
      })()}
      {next && !editing && <div className={styles.detailActions}>
        <button type="button" className={styles.primaryAction} disabled={pending} onClick={() => run(next.status)}>{next.label}</button>
        {cancel && <button type="button" className={styles.cancelAction} disabled={pending} onClick={() => setConfirmCancel(true)}>Отменить заказ</button>}
      </div>}
    </div>
    <section className={styles.detailSection}>
      <h3 className={styles.contactName}>{order.customerName}</h3>
      <GuestContactActions phone={order.customerPhone} preferredChannel={order.preferredChannel} channels={guestContact}/>
    </section>
    <section className={styles.detailSection}>
      <div className={styles.facts}>
        {order.desiredTime && <div className={styles.fact}><span>{order.type === "delivery" ? "Доставить к" : "Забрать к"}</span><strong>{order.desiredTime}</strong></div>}
        {order.type === "delivery" && <div className={styles.fact}><span>Адрес</span><strong>{order.addressText || "Не указан"}</strong></div>}
        {order.type === "delivery" && order.deliveryZoneName && <div className={styles.fact}><span>Зона доставки</span><strong>{order.deliveryZoneName}</strong></div>}
        <div className={styles.fact}><span>Оплата</span><strong>{order.paymentMethod === "online" ? `Онлайн${order.paymentStatus === "paid" ? " · оплачено" : ""}` : "При получении"}</strong></div>
      </div>
      {order.comment && <p className={styles.note}>{order.comment}</p>}
    </section>
    <section className={styles.detailSection}>
      <div className={styles.sectionTitle}><h3>Состав</h3>{!editBlocked && !editing && <button type="button" className={styles.textButton} onClick={() => setEditing(true)}>Изменить</button>}</div>
      {editing && !editBlocked ? <OrderEditor order={order} catalog={catalog} deliveryOptions={deliveryOptions} deliveryZones={deliveryZones} onClose={() => setEditing(false)}/> : <>
        <div className={styles.lineItems}>{order.items.map((item) => {
          const dish = dishes.get(item.dishId);
          const modifiers = (item.modifiers as { name?: string }[] | null) ?? [];
          return <div key={item.id} className={styles.lineItem}>
            <strong>{item.name}</strong>
            <small>{item.menuName ? <span className={styles.menuBadge}>{item.menuName}</span> : null}{dish?.weight ? `${dish.weight} · ` : ""}{rub(item.price)} за шт.{modifiers.length ? ` · ${modifiers.map((modifier) => modifier.name).join(", ")}` : ""}</small>
            <b>{item.quantity} × {rub(item.total)}</b>
          </div>;
        })}</div>
        {(() => {
          const byMenu = new Map<string, number>();
          for (const item of order.items) {
            const key = item.menuName || "";
            byMenu.set(key, (byMenu.get(key) ?? 0) + item.quantity);
          }
          const parts = [...byMenu.entries()].filter(([name]) => name).map(([name, qty]) => `${name} ×${qty}`);
          return parts.length > 0 ? <p className={styles.menuSummary}>Меню заказа: {parts.join(" · ")}</p> : null;
        })()}
        <div className={styles.sumLines}>
          <div className={styles.sumLine}><span>Блюда</span><b>{rub(order.itemsTotal)}</b></div>
          {order.deliveryPrice > 0 && <div className={styles.sumLine}><span>Доставка</span><b>{rub(order.deliveryPrice)}</b></div>}
          {order.bonusSpent > 0 && <div className={styles.sumLine}><span>Бонусы</span><b>−{rub(order.bonusSpent)}</b></div>}
          <div className={`${styles.sumLine} ${styles.total}`}><span>Итого</span><b>{rub(order.total)}</b></div>
        </div>
        {editBlocked && <p className={styles.muted}>{editBlocked}</p>}
      </>}
    </section>
    {cancel && !editing && <button type="button" className={styles.orderMobileCancel} disabled={pending} onClick={() => setConfirmCancel(true)}>Отменить заказ</button>}
    {next && !editing && <div className={styles.orderMobileAction}><button type="button" className={styles.primaryAction} disabled={pending} onClick={() => run(next.status)}>{next.label}</button></div>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <ConfirmDialog
      request={confirmCancel ? {
        title: "Отменить заказ?",
        text: `Заказ № ${order.number} перейдёт в историю.`,
        acceptLabel: "Отменить заказ",
        onAccept: () => run("cancelled"),
      } : null}
      onClose={() => setConfirmCancel(false)}
    />
  </div>;
}
