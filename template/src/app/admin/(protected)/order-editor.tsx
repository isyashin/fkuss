"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Order, OrderItem } from "@/generated/prisma/client";
import type { OrderEditInput } from "@/lib/admin-order-edit";
import { saveOrderItems } from "./actions";
import type { CatalogCategory, CatalogDish, DeliveryOptionChoice, DeliveryZoneChoice } from "./order-editor-types";
import styles from "./order-editor.module.css";

type DraftLine =
  | { kind: "existing"; key: string; itemId: string; quantity: number; item: OrderItem }
  | { kind: "new"; key: string; dishId: string; quantity: number; modifierIds: string[] };

const rub = (value: number) => `${new Intl.NumberFormat("ru-RU").format(value)} ₽`;

export function OrderEditor({ order, catalog, deliveryOptions, deliveryZones, onClose }: {
  order: Order & { items: OrderItem[] };
  catalog: CatalogCategory[];
  deliveryOptions: DeliveryOptionChoice[];
  deliveryZones: DeliveryZoneChoice[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [lines, setLines] = useState<DraftLine[]>(order.items.map((item) => ({ kind: "existing", key: item.id, itemId: item.id, quantity: item.quantity, item })));
  const [selectedDish, setSelectedDish] = useState("");
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
  const add = () => {
    if (!selectedDish || !dishMap.has(selectedDish)) return;
    setLines((current) => [...current, { kind: "new", key: crypto.randomUUID(), dishId: selectedDish, quantity: 1, modifierIds: [] }]);
    setSelectedDish("");
  };
  const toggleModifier = (key: string, modifierId: string) => setLines((current) => current.map((line) => line.key !== key || line.kind !== "new" ? line : {
    ...line, modifierIds: line.modifierIds.includes(modifierId)
      ? line.modifierIds.filter((id) => id !== modifierId) : [...line.modifierIds, modifierId],
  }));

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
    <p className={styles.hint}>Цены существующих позиций сохраняются из заказа. Новые блюда добавляются по текущей цене каталога. Итог пересчитает сервер.</p>
    <div className={styles.lines}>{lines.map((line) => {
      const dish: CatalogDish | undefined = line.kind === "new" ? dishMap.get(line.dishId) : undefined;
      const name = line.kind === "existing" ? line.item.name : dish?.name ?? "Блюдо удалено из каталога";
      const unit = line.kind === "existing"
        ? line.item.price + ((Array.isArray(line.item.modifiers) ? line.item.modifiers : []) as { price: number }[]).reduce((sum, modifier) => sum + (modifier.price ?? 0), 0)
        : (dish?.price ?? 0) + (dish ? [...dish.modifiers, ...dish.groups.flatMap((group) => group.modifiers)]
          .filter((modifier) => line.modifierIds.includes(modifier.id)).reduce((sum, modifier) => sum + modifier.price, 0) : 0);
      return <div className={styles.line} key={line.key}>
        <div className={styles.lineHead}><div><strong>{name}</strong><small>{rub(unit)} за шт.{line.kind === "new" ? " · новое блюдо" : ""}</small></div><button type="button" className={styles.remove} onClick={() => remove(line.key)} disabled={pending} aria-label={`Удалить ${name}`}>Удалить</button></div>
        <div className={styles.quantity}><span>Количество</span><div><button type="button" onClick={() => setQuantity(line.key, Math.max(1, line.quantity - 1))} disabled={pending || line.quantity <= 1} aria-label={`Уменьшить количество: ${name}`}>−</button><input aria-label={`Количество: ${name}`} type="number" min="1" max="99" step="1" value={line.quantity} onChange={(event) => setQuantity(line.key, Number(event.target.value))} disabled={pending}/><button type="button" onClick={() => setQuantity(line.key, Math.min(99, line.quantity + 1))} disabled={pending || line.quantity >= 99} aria-label={`Увеличить количество: ${name}`}>+</button></div><strong>{rub(unit * line.quantity)}</strong></div>
        {line.kind === "new" && dish && (dish.modifiers.length > 0 || dish.groups.length > 0) && <div className={styles.modifiers}>
          {dish.modifiers.length > 0 && <fieldset><legend>Добавки</legend>{dish.modifiers.map((modifier) => <label key={modifier.id}><input type="checkbox" checked={line.modifierIds.includes(modifier.id)} onChange={() => toggleModifier(line.key, modifier.id)} disabled={pending}/><span>{modifier.name} · {rub(modifier.price)}</span></label>)}</fieldset>}
          {dish.groups.map((group) => <fieldset key={group.id}><legend>{group.name} ({group.minSelected}–{group.maxSelected})</legend>{group.modifiers.map((modifier) => <label key={modifier.id}><input type="checkbox" checked={line.modifierIds.includes(modifier.id)} onChange={() => toggleModifier(line.key, modifier.id)} disabled={pending}/><span>{modifier.name} · {rub(modifier.price)}</span></label>)}</fieldset>)}
        </div>}
      </div>;
    })}</div>
    <div className={styles.add}><label htmlFor={`add-dish-${order.id}`}>Добавить блюдо из каталога</label><div><select id={`add-dish-${order.id}`} value={selectedDish} onChange={(event) => setSelectedDish(event.target.value)} disabled={pending}><option value="">Выберите блюдо</option>{catalog.map((category) => <optgroup key={category.id} label={category.name}>{category.dishes.map((dish) => <option key={dish.id} value={dish.id}>{dish.name} · {rub(dish.price)}</option>)}</optgroup>)}</select><button type="button" onClick={add} disabled={pending || !selectedDish}>Добавить</button></div></div>
    {order.type === "delivery" && <div className={styles.add}><label htmlFor={`delivery-choice-${order.id}`}>Расчёт доставки</label><select id={`delivery-choice-${order.id}`} value={deliveryChoice} onChange={(event) => setDeliveryChoice(event.target.value)} disabled={pending}><option value="">Выберите для пересчёта</option>{order.deliveryOptionName
      ? deliveryOptions.filter((option) => option.name === order.deliveryOptionName).map((option) => <option key={option.id} value={`option:${option.id}`}>{option.name}</option>)
      : deliveryZones.map((zone) => <option key={zone.name} value={`zone:${zone.name}`}>{zone.name}</option>)}</select><small>Цена доставки и бонусы обновятся по действующим правилам.</small></div>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <div className={styles.footer}><button type="button" onClick={onClose} disabled={pending}>Отмена</button><button type="submit" disabled={pending || lines.length === 0}>{pending ? "Сохраняем…" : "Сохранить заказ"}</button></div>
  </form>;
}
