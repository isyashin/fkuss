"use client";

import { useState } from "react";
import Image from "next/image";
import { useCart } from "@/lib/cart/store";
import { contentAssetUrl } from "@/lib/assets";
import type { ContentSettings } from "@/lib/content-schema";

function formatPrice(price: number): string {
  return `${price.toLocaleString("ru-RU")} ₽`;
}

type Step = "cart" | "form" | "success";

/** Корзина + оформление заказа — нижняя шторка */
export function CartSheet({
  delivery,
  loyalty,
  whatsapp,
  onClose,
}: {
  delivery: ContentSettings["delivery"];
  loyalty: ContentSettings["loyalty"];
  whatsapp: ContentSettings["channels"]["whatsapp"];
  onClose: () => void;
}) {
  const { items, setQuantity, clear, total } = useCart();
  const [step, setStep] = useState<Step>("cart");
  const [error, setError] = useState("");
  const [orderNumber, setOrderNumber] = useState<number | null>(null);
  const [orderText, setOrderText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [type, setType] = useState<"delivery" | "pickup">(delivery.enabled ? "delivery" : "pickup");
  const [zoneName, setZoneName] = useState(delivery.zones[0]?.name ?? "");
  const [form, setForm] = useState({ address: "", name: "", phone: "", email: "", comment: "", website: "" });

  const itemsTotal = total();
  const zone = delivery.zones.find((z) => z.name === zoneName);
  const deliveryPrice =
    type === "pickup" ? 0 : zone ? (zone.freeFrom !== null && itemsTotal >= zone.freeFrom ? 0 : zone.price) : 0;
  const orderTotal = itemsTotal + deliveryPrice;

  async function submit() {
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({
            dishId: i.dishId,
            quantity: i.quantity,
            modifierIds: i.modifiers.map((m) => m.id),
          })),
          type,
          zoneName: type === "delivery" ? zoneName : null,
          address: form.address,
          customerName: form.name,
          customerPhone: form.phone,
          customerEmail: form.email,
          comment: form.comment,
          website: form.website, // honeypot
          bonusSpend: 0,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Ошибка оформления");
        return;
      }
      const text = [
        `Заказ №${data.orderNumber}`,
        ...items.map((i) => `${i.name} × ${i.quantity}`),
        `Итого: ${orderTotal.toLocaleString("ru-RU")} ₽`,
        `Гость: ${form.name}, ${form.phone}`,
        type === "delivery" ? `Адрес: ${form.address}` : "Самовывоз",
      ].join("\n");
      setOrderText(text);
      setOrderNumber(data.orderNumber);
      setStep("success");
      clear();
    } catch {
      setError("Нет связи. Попробуйте ещё раз.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal>
      <button className="absolute inset-0 bg-black/50" onClick={onClose} aria-label="Закрыть" />
      <div className="relative bg-background w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl">
            {step === "cart" && "Корзина"}
            {step === "form" && "Оформление"}
            {step === "success" && "Заказ принят"}
          </h2>
          <button onClick={onClose} className="min-w-11 min-h-11 text-xl" aria-label="Закрыть">
            ×
          </button>
        </div>

        {step === "cart" && (
          <>
            <div className="space-y-3">
              {items.map((item) => {
                const lineTotal =
                  (item.price + item.modifiers.reduce((s, m) => s + m.price, 0)) * item.quantity;
                return (
                  <div key={`${item.dishId}:${item.modifiers.map((m) => m.id).join(",")}`} className="flex gap-3 items-center">
                    <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-foreground/5 shrink-0">
                      <Image src={contentAssetUrl(item.image)} alt={item.name} fill sizes="64px" className="object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium leading-snug">{item.name}</p>
                      {item.modifiers.length > 0 && (
                        <p className="text-muted text-xs">{item.modifiers.map((m) => m.name).join(", ")}</p>
                      )}
                      <p className="text-accent font-semibold mt-0.5">{formatPrice(lineTotal)}</p>
                    </div>
                    <div className="flex items-center border border-foreground/20 rounded-full shrink-0">
                      <button
                        onClick={() => setQuantity(item.dishId, item.modifiers, item.quantity - 1)}
                        className="min-w-11 min-h-11 text-lg"
                        aria-label="Меньше"
                      >
                        −
                      </button>
                      <span className="w-6 text-center">{item.quantity}</span>
                      <button
                        onClick={() => setQuantity(item.dishId, item.modifiers, item.quantity + 1)}
                        className="min-w-11 min-h-11 text-lg"
                        aria-label="Больше"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => setStep("form")}
              disabled={items.length === 0}
              className="mt-5 w-full min-h-12 rounded-full bg-accent text-white font-medium text-lg disabled:opacity-50"
            >
              Оформить · {formatPrice(itemsTotal)}
            </button>
          </>
        )}

        {step === "form" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              {delivery.enabled && (
                <button
                  onClick={() => setType("delivery")}
                  className={`flex-1 min-h-11 rounded-full font-medium ${type === "delivery" ? "bg-accent text-white" : "bg-card"}`}
                >
                  Доставка
                </button>
              )}
              {delivery.pickupEnabled && (
                <button
                  onClick={() => setType("pickup")}
                  className={`flex-1 min-h-11 rounded-full font-medium ${type === "pickup" ? "bg-accent text-white" : "bg-card"}`}
                >
                  Самовывоз
                </button>
              )}
            </div>

            {type === "delivery" && (
              <>
                {delivery.zones.length > 1 && (
                  <label className="block">
                    <span className="text-sm text-muted">Зона доставки</span>
                    <select
                      value={zoneName}
                      onChange={(e) => setZoneName(e.target.value)}
                      className="mt-1 w-full min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15"
                    >
                      {delivery.zones.map((z) => (
                        <option key={z.name} value={z.name}>
                          {z.name} — {z.freeFrom !== null ? `бесплатно от ${z.freeFrom} ₽` : `${z.price} ₽`}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="block">
                  <span className="text-sm text-muted">Адрес</span>
                  <input
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="Улица, дом, квартира"
                    className="mt-1 w-full min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15"
                  />
                </label>
              </>
            )}

            <label className="block">
              <span className="text-sm text-muted">Имя</span>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoComplete="name"
                className="mt-1 w-full min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15"
              />
            </label>
            <label className="block">
              <span className="text-sm text-muted">Телефон</span>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+7 ___ ___-__-__"
                className="mt-1 w-full min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15"
              />
            </label>
            <label className="block">
              <span className="text-sm text-muted">Email (для бонусов и истории заказов)</span>
              <input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                type="email"
                inputMode="email"
                autoComplete="email"
                className="mt-1 w-full min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15"
              />
            </label>
            <label className="block">
              <span className="text-sm text-muted">Комментарий</span>
              <textarea
                value={form.comment}
                onChange={(e) => setForm({ ...form, comment: e.target.value })}
                rows={2}
                className="mt-1 w-full px-3 py-2 rounded-[var(--radius)] bg-card border border-foreground/15"
              />
            </label>

            {/* honeypot: скрыто от людей, боты заполняют */}
            <input
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              className="hidden"
              aria-hidden="true"
            />

            <div className="border-t border-foreground/10 pt-3 space-y-1 text-sm">
              <div className="flex justify-between text-muted">
                <span>Позиции</span>
                <span>{formatPrice(itemsTotal)}</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Доставка</span>
                <span>{deliveryPrice === 0 ? "бесплатно" : formatPrice(deliveryPrice)}</span>
              </div>
              <div className="flex justify-between font-semibold text-lg pt-1">
                <span>Итого</span>
                <span>{formatPrice(orderTotal)}</span>
              </div>
              <p className="text-muted text-xs pt-1">
                Оплата при получении. Бонусы: кэшбэк {loyalty.cashbackPercent}% после выполнения заказа.
              </p>
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}

            <div className="flex gap-2">
              <button onClick={() => setStep("cart")} className="min-h-12 px-5 rounded-full border border-foreground/20">
                Назад
              </button>
              <button
                onClick={submit}
                disabled={submitting || !form.name || !form.phone || (type === "delivery" && !form.address)}
                className="flex-1 min-h-12 rounded-full bg-accent text-white font-medium text-lg disabled:opacity-50"
              >
                {submitting ? "Отправляю…" : `Заказать · ${formatPrice(orderTotal)}`}
              </button>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="text-center py-8">
            <p className="text-5xl mb-4">✓</p>
            <p className="text-xl font-medium">Заказ №{orderNumber} принят</p>
            <p className="text-muted mt-2">Мы позвоним для подтверждения.</p>
            {whatsapp.enabled && whatsapp.phone && (
              <a
                href={`https://wa.me/${whatsapp.phone.replace(/\D/g, "")}?text=${encodeURIComponent(orderText)}`}
                target="_blank"
                rel="noopener"
                className="mt-5 inline-flex items-center justify-center min-h-12 px-6 rounded-full bg-[#25D366] text-white font-medium"
              >
                Дублировать заказ в WhatsApp
              </a>
            )}
            <div>
              <button onClick={onClose} className="mt-4 min-h-12 px-8 rounded-full bg-accent text-white font-medium">
                Отлично
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
