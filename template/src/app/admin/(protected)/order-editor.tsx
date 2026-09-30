"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Order, OrderItem } from "@/generated/prisma/client";
import type { OrderEditInput } from "@/lib/admin-order-edit";
import { adminDraftItemsTotal, adminDraftLineUnit } from "@/lib/admin-draft-preview";
import { saveOrderItems } from "./actions";
import { AdminIcon } from "./admin-icon";
import type { CatalogCategory, CatalogDish, DeliveryOptionChoice, DeliveryZoneChoice } from "./order-editor-types";
import styles from "./order-editor.module.css";

type DraftLine =
  | { kind: "existing"; key: string; itemId: string; quantity: number; item: OrderItem }
  | { kind: "new"; key: string; dishId: string; quantity: number; modifierIds: string[] };

const rub = (value: number) => `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;

export function OrderEditor({ order, catalog, deliveryOptions, deliveryZones, onClose }: {
  order: Order & { items: OrderItem[] }; catalog: CatalogCategory[];
  deliveryOptions: DeliveryOptionChoice[]; deliveryZones: DeliveryZoneChoice[]; onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [lines, setLines] = useState<DraftLine[]>(order.items.map((item) => ({ kind: "existing", key: item.id, itemId: item.id, quantity: item.quantity, item })));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerCategory, setPickerCategory] = useState("all");
  const [deliveryChoice, setDeliveryChoice] = useState(
    order.type === "pickup" ? "" : order.deliveryOptionName
      ? (() => { const matches = deliveryOptions.filter((option) => option.name === order.deliveryOptionName); return matches.length === 1 ? `option:${matches[0].id}` : ""; })()
      : "",
  );
  const [error, setError] = useState("");
  const dishes = catalog.flatMap((category) => category.dishes);
  const dishMap = new Map(dishes.map((dish) => [dish.id, dish]));
  const setQuantity = (key: string, quantity: number) => setLines((current) => current.map((line) => line.key === key ? { ...line, quantity } : line));
  const remove = (key: string) => setLines((current) => current.filter((line) => line.key !== key));
  const add = (dishId: string) => {
    if (!dishMap.has(dishId)) return;
    setLines((current) => [...current, { kind: "new", key: crypto.randomUUID(), dishId, quantity: 1, modifierIds: [] }]);
    setPickerOpen(false);
    setPickerQuery("");
  };
  const toggleModifier = (key: string, modifierId: string) => setLines((current) => current.map((line) => line.key !== key || line.kind !== "new" ? line : {
    ...line, modifierIds: line.modifierIds.includes(modifierId)
      ? line.modifierIds.filter((id) => id !== modifierId) : [...line.modifierIds, modifierId],
  }));
  const shownDishes = catalog.flatMap((category) => category.dishes.map((dish) => ({ dish, categoryId: category.id })))
    .filter(({ dish, categoryId }) => (pickerCategory === "all" || categoryId === pickerCategory) && dish.name.toLocaleLowerCase("ru-RU").includes(pickerQuery.toLocaleLowerCase("ru-RU")));

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (lines.length === 0) { setError("В заказе должно остаться хотя бы одно блюдо"); return; }
    if (lines.some((line) => !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99)) {
      setError("Количество каждого блюда должно быть от 1 до 99"); return;
    }
    if (order.type === "delivery" && !deliveryChoice) { setError("Выберите способ расчёта доставки"); return; }
    const choice: OrderEditInput["deliveryChoice"] = order.type === "pickup" ? null
      : deliveryChoice.startsWith("option:") ? { kind: "option", id: deliveryChoice.slice(7) }
      : { kind: "zone", name: deliveryChoice.slice(5) };
    startTransition(async () => {
      try {
        await saveOrderItems({ orderId: order.id, expectedUpdatedAt: order.updatedAt.toISOString(),
          lines: lines.map((line) => line.kind === "existing"
            ? { kind: "existing", itemId: line.itemId, quantity: line.quantity }
            : { kind: "new", dishId: line.dishId, modifierIds: line.modifierIds, quantity: line.quantity }),
          deliveryChoice: choice });
        onClose();
        router.refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Не удалось сохранить заказ");
      }
    });
  };

  return <form className={styles.editor} onSubmit={submit}>
    <div className={styles.lines}>{lines.length ? lines.map((line) => {
      const dish: CatalogDish | undefined = dishMap.get(line.kind === "new" ? line.dishId : line.item.dishId);
      const name = line.kind === "existing" ? line.item.name : dish?.name ?? "Блюдо удалено из каталога";
      const unit = adminDraftLineUnit(line, dishMap);
      return <div className={styles.line} key={line.key}>
        <div className={styles.linePhoto}>{dish?.image ? <Image src={dish.image} width={52} height={52} alt="" unoptimized/> : <span>Без фото</span>}</div>
        <div className={styles.lineCopy}><strong>{name}</strong><small>{dish?.weight ? `${dish.weight} · ` : ""}{rub(unit)} за шт.{line.kind === "new" ? " · новое блюдо" : ""}</small></div>
        <div className={styles.quantity}><button type="button" onClick={() => setQuantity(line.key, Math.max(1, line.quantity - 1))} disabled={pending || line.quantity <= 1} aria-label={`Уменьшить количество: ${name}`}><AdminIcon name="minus" size={16}/></button><input aria-label={`Количество: ${name}`} type="number" min="1" max="99" step="1" value={line.quantity} onChange={(event) => setQuantity(line.key, Number(event.target.value))} disabled={pending}/><button type="button" onClick={() => setQuantity(line.key, Math.min(99, line.quantity + 1))} disabled={pending || line.quantity >= 99} aria-label={`Увеличить количество: ${name}`}><AdminIcon name="plus" size={16}/></button></div>
        <strong className={styles.linePrice}>{rub(unit * line.quantity)}</strong>
        <button type="button" className={styles.remove} onClick={() => remove(line.key)} disabled={pending} aria-label={`Удалить ${name}`}><AdminIcon name="close" size={16}/></button>
        {line.kind === "new" && dish && (dish.modifiers.length > 0 || dish.groups.length > 0) && <div className={styles.modifiers}>
          {dish.modifiers.length > 0 && <fieldset><legend>Добавки</legend>{dish.modifiers.map((modifier) => <label key={modifier.id}><input type="checkbox" checked={line.modifierIds.includes(modifier.id)} onChange={() => toggleModifier(line.key, modifier.id)} disabled={pending}/><span>{modifier.name} · {rub(modifier.price)}</span></label>)}</fieldset>}
          {dish.groups.map((group) => <fieldset key={group.id}><legend>{group.name} ({group.minSelected}–{group.maxSelected})</legend>{group.modifiers.map((modifier) => <label key={modifier.id}><input type="checkbox" checked={line.modifierIds.includes(modifier.id)} onChange={() => toggleModifier(line.key, modifier.id)} disabled={pending}/><span>{modifier.name} · {rub(modifier.price)}</span></label>)}</fieldset>)}
        </div>}
      </div>;
    }) : <p className={styles.empty}>В заказе пока нет блюд</p>}</div>
    <button type="button" className={styles.addButton} onClick={() => setPickerOpen(true)} disabled={pending}><AdminIcon name="plus" size={19}/> Добавить блюдо</button>
    <div className={styles.totalRow}><span>Сумма блюд</span><strong>{rub(adminDraftItemsTotal(lines, dishMap))}</strong></div>
    <p className={styles.hint}>Предварительная сумма блюд. Итог с доставкой и бонусами пересчитает сервер при сохранении.</p>
    {order.type === "delivery" && <div className={styles.deliveryChoice}><label htmlFor={`delivery-choice-${order.id}`}>Расчёт доставки</label><select id={`delivery-choice-${order.id}`} value={deliveryChoice} onChange={(event) => setDeliveryChoice(event.target.value)} disabled={pending}><option value="">Выберите для пересчёта</option>{order.deliveryOptionName
      ? deliveryOptions.filter((option) => option.name === order.deliveryOptionName).map((option) => <option key={option.id} value={`option:${option.id}`}>{option.name}</option>)
      : deliveryZones.map((zone) => <option key={zone.name} value={`zone:${zone.name}`}>{zone.name}</option>)}</select></div>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.footer}><button type="button" onClick={onClose} disabled={pending}>Отменить правки</button><button type="submit" disabled={pending || lines.length === 0}>{pending ? "Сохраняем…" : "Сохранить состав"}</button></div>
    {pickerOpen && <div className={styles.modalBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) setPickerOpen(false); }}><div className={styles.picker} role="dialog" aria-modal="true" aria-label="Добавить блюдо в заказ">
      <div className={styles.pickerHead}><h3>Добавить блюдо</h3><button type="button" onClick={() => setPickerOpen(false)} aria-label="Закрыть окно"><AdminIcon name="close"/></button></div>
      <input className={styles.pickerSearch} type="search" value={pickerQuery} onChange={(event) => setPickerQuery(event.target.value)} placeholder="Поиск по меню" aria-label="Поиск по меню"/>
      <div className={styles.pickerCategories} role="group" aria-label="Категории">{[{ id: "all", name: "Все" }, ...catalog].map((category) => <button type="button" key={category.id} aria-pressed={pickerCategory === category.id} onClick={() => setPickerCategory(category.id)}>{category.name}</button>)}</div>
      <div className={styles.pickerList}>{shownDishes.length ? shownDishes.map(({ dish }) => <button type="button" key={dish.id} onClick={() => add(dish.id)}><span className={styles.linePhoto}>{dish.image ? <Image src={dish.image} width={52} height={52} alt="" unoptimized/> : <span>Без фото</span>}</span><span><strong>{dish.name}</strong><small>{dish.weight}</small></span><b>{rub(dish.price)}</b><AdminIcon name="plus" size={16}/></button>) : <p className={styles.empty}>Блюда не найдены</p>}</div>
    </div></div>}
  </form>;
}
