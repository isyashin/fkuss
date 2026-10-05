"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCart } from "@/lib/cart/store";
import { dishImageUrl } from "@/lib/assets";
import { tariffPrice, tariffLines, zoneTariffs, type ZoneTariff } from "@/lib/order/pricing";
import type { ContentSettings } from "@/lib/content-schema";
import type { GuestChannels, PreferredChannel } from "@/lib/guest-contact";
import { DeliveryMap } from "@/components/cart/delivery-map";
import { loadYmaps, type YSuggestView } from "@/components/cart/ymaps";

function formatPrice(price: number): string {
  return `${price.toLocaleString("ru-RU")} ₽`;
}

type Step = "cart" | "form" | "success";

/** Корзина + оформление заказа — нижняя шторка */
export function CartSheet({
  delivery,
  loyalty,
  whatsapp,
  guestContact,
  paymentProvider = "none",
  bonusBalance = 0,
  cabinetEnabled = false,
  initialAddress = "",
  ymapsKey = "",
  onClose,
}: {
  delivery: ContentSettings["delivery"];
  loyalty: ContentSettings["loyalty"];
  whatsapp: ContentSettings["channels"]["whatsapp"];
  guestContact: GuestChannels;
  paymentProvider?: string;
  bonusBalance?: number;
  cabinetEnabled?: boolean;
  initialAddress?: string;
  /** Ключ JS API Яндекс Карт (публичный). Пустой — карта и подсказки отключены. */
  ymapsKey?: string;
  onClose: () => void;
}) {
  const { items, setQuantity, clear, total } = useCart();
  const [step, setStep] = useState<Step>("cart");
  const [error, setError] = useState("");
  const [orderNumber, setOrderNumber] = useState<number | null>(null);
  const [orderText, setOrderText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [type, setType] = useState<"delivery" | "pickup">(delivery.enabled ? "delivery" : "pickup");
  const [zoneName, setZoneName] = useState(
    delivery.zones.find((z) => z.enabled !== false)?.name ?? "",
  );
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "online">("cash");
  const [preferredChannel, setPreferredChannel] = useState<PreferredChannel>("phone");
  const [bonusSpend, setBonusSpend] = useState(0);
  const [form, setForm] = useState({ address: initialAddress, name: "", phone: "", email: "", comment: "", website: "" });

  // Варианты доставки и окна (если настроены)
  const [options, setOptions] = useState<{
    id: string;
    name: string;
    mode: "asap" | "scheduled";
    price: number;
    freeFrom: number | null;
    windows: { date: string; start: string; end: string }[];
  }[]>([]);
  const [deliveryOptionId, setDeliveryOptionId] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [slotStart, setSlotStart] = useState("");

  useEffect(() => {
    fetch("/api/delivery/slots")
      .then((r) => r.json())
      .then((data) => {
        const opts = data.options ?? [];
        setOptions(opts);
        if (opts.length > 0) setDeliveryOptionId(opts[0].id);
      })
      .catch(() => {});
  }, []);

  const itemsTotal = total();
  const selectedOption = options.find((o) => o.id === deliveryOptionId);
  const zone = delivery.zones.find((z) => z.name === zoneName);

  // Зоны на карте: автоопределение зоны по адресу вместо выбора из списка.
  // Варианты доставки (options), если настроены, вытесняют зоны — geo-режим не работает.
  const geoZones = delivery.zones.filter((z) => (z.polygon?.length ?? 0) >= 3);
  const geoActive = Boolean(delivery.geo?.enabled && options.length === 0 && geoZones.length > 0);

  type GeoState =
    | { status: "idle" | "loading" | "address-not-found" | "error" }
    | { status: "zone"; zoneName: string; tariffs: ZoneTariff[]; deliveryMinutes: number | null; lat: number; lng: number }
    | { status: "outside-allowed"; lat: number; lng: number }
    | { status: "outside-blocked"; lat: number; lng: number };

  const [geo, setGeo] = useState<GeoState>({ status: "idle" });
  const geoSeq = useRef(0);
  const addressRef = useRef<HTMLInputElement>(null);

  const lookupZone = useCallback(async (address: string) => {
    const seq = ++geoSeq.current;
    setGeo({ status: "loading" });
    try {
      const r = await fetch(`/api/delivery/zone?address=${encodeURIComponent(address)}`);
      const data = (await r.json()) as {
        kind?: string;
        zoneName?: string;
        tariffs?: ZoneTariff[];
        deliveryMinutes?: number | null;
        lat?: number;
        lng?: number;
      };
      if (seq !== geoSeq.current) return; // ответ устарел, адрес уже другой
      switch (data.kind) {
        case "zone":
          setGeo({
            status: "zone",
            zoneName: data.zoneName ?? "",
            tariffs: data.tariffs ?? [{ from: 0, price: 0 }],
            deliveryMinutes: data.deliveryMinutes ?? null,
            lat: data.lat ?? 0,
            lng: data.lng ?? 0,
          });
          break;
        case "outside-allowed":
          setGeo({ status: "outside-allowed", lat: data.lat ?? 0, lng: data.lng ?? 0 });
          break;
        case "outside-blocked":
          setGeo({ status: "outside-blocked", lat: data.lat ?? 0, lng: data.lng ?? 0 });
          break;
        case "address-not-found":
          setGeo({ status: "address-not-found" });
          break;
        default:
          setGeo({ status: "error" });
      }
    } catch {
      if (seq === geoSeq.current) setGeo({ status: "error" });
    }
  }, []);

  // Определение зоны с задержкой, чтобы не дёргать геокодер на каждую букву.
  // Сброс состояния — в onChange адреса (ниже), здесь только планируем запрос.
  useEffect(() => {
    if (!geoActive || type !== "delivery") return;
    const address = form.address.trim();
    if (address.length < 6) return;
    const timer = setTimeout(() => void lookupZone(address), 600);
    return () => clearTimeout(timer);
  }, [geoActive, type, form.address, lookupZone]);

  // Подсказки адресов (JS API). Без ключа или без suggest в пакете ключа —
  // просто свободный ввод; асинхронную ошибку Suggest глушим, чтобы не сорить консолью.
  useEffect(() => {
    if (!geoActive || !ymapsKey || type !== "delivery" || step !== "form") return;
    let destroyed = false;
    let suggest: YSuggestView | null = null;
    const swallowSuggestError = (event: ErrorEvent) => {
      if (String(event.message).includes("Suggest")) event.preventDefault();
    };
    window.addEventListener("error", swallowSuggestError);
    loadYmaps(ymapsKey)
      .then((ymaps) => {
        if (destroyed || !addressRef.current) return;
        try {
          suggest = new ymaps.SuggestView(addressRef.current, { results: 5 });
          suggest.events.add("select", (e) => {
            const item = e.get("item") as { value?: string } | undefined;
            if (item?.value) {
              setForm((f) => ({ ...f, address: item.value ?? f.address }));
            }
          });
        } catch {
          // Suggest недоступен для ключа (пакет без подсказок) — свободный ввод
        }
      })
      .catch(() => {});
    return () => {
      destroyed = true;
      window.removeEventListener("error", swallowSuggestError);
      suggest?.destroy();
    };
  }, [geoActive, ymapsKey, type, step]);

  // Цена доставки в geo-режиме из текущей корзины и найденной зоны.
  // Тарифы берём из ответа API (сырые условия), цену считаем локально —
  // корзина может меняться без нового запроса.
  const geoTariffs = geo.status === "zone" ? (geo.tariffs ?? null) : null;
  const geoPrice =
    geo.status === "zone" && geoTariffs
      ? tariffPrice(geoTariffs, itemsTotal)
      : geo.status === "outside-allowed"
        ? (delivery.geo?.outsidePrice ?? 0)
        : 0;
  const geoResolved = geo.status === "zone" || geo.status === "outside-allowed";

  const deliveryPrice =
    type === "pickup"
      ? 0
      : selectedOption
        ? selectedOption.freeFrom !== null && itemsTotal >= selectedOption.freeFrom
          ? 0
          : selectedOption.price
        : geoActive
          ? geoPrice
          : zone
            ? tariffPrice(zoneTariffs(zone), itemsTotal)
            : 0;
  const orderTotal = itemsTotal + deliveryPrice;
  const maxBonusSpend = Math.min(
    Math.floor((itemsTotal * loyalty.maxSpendPercent) / 100),
    bonusBalance,
  );
  const finalTotal = orderTotal - Math.min(bonusSpend, maxBonusSpend);

  const optionDates = selectedOption
    ? [...new Set(selectedOption.windows.map((w) => w.date))]
    : [];
  const optionSlots = selectedOption?.windows.filter((w) => w.date === deliveryDate) ?? [];

  async function submit() {
    setError("");
    setSubmitting(true);
    // Слоты доставки отправляем только для доставки с выбранным окном:
    // иначе самовывоз с scheduled-вариантом в настройках шлёт пустую дату
    // и серверная схема отклоняет заказ.
    const scheduledDelivery = type === "delivery" && selectedOption?.mode === "scheduled";
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
          preferredChannel,
          customerEmail: form.email,
          comment: form.comment,
          website: form.website, // honeypot
          bonusSpend,
          paymentMethod,
          deliveryMode: scheduledDelivery ? "scheduled" : "asap",
          deliveryDate: scheduledDelivery ? deliveryDate : null,
          deliverySlotStart: scheduledDelivery ? slotStart : null,
          deliverySlotEnd: scheduledDelivery
            ? optionSlots.find((s) => s.start === slotStart)?.end ?? null
            : null,
          deliveryOptionId: selectedOption?.id ?? null,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Ошибка оформления");
        return;
      }
      // Онлайн-оплата: уходим на страницу оплаты провайдера
      if (data.confirmationUrl) {
        globalThis.location.assign(data.confirmationUrl);
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
                      <img src={dishImageUrl(item.image, "sm")} alt={item.name} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
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
                {options.length > 0 && (
                  <label className="block">
                    <span className="text-sm text-muted">Способ доставки</span>
                    <select
                      value={deliveryOptionId}
                      onChange={(e) => {
                        setDeliveryOptionId(e.target.value);
                        setDeliveryDate("");
                        setSlotStart("");
                      }}
                      className="mt-1 w-full min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15"
                    >
                      {options.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name} — {o.mode === "asap" ? "как можно скорее" : "к выбранному времени"} ·{" "}
                          {o.freeFrom !== null ? `бесплатно от ${o.freeFrom} ₽` : `${o.price} ₽`}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {selectedOption?.mode === "scheduled" && (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-sm text-muted">Дата</span>
                      <select
                        value={deliveryDate}
                        onChange={(e) => {
                          setDeliveryDate(e.target.value);
                          setSlotStart("");
                        }}
                        className="mt-1 w-full min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15"
                      >
                        <option value="">Выберите</option>
                        {optionDates.map((d) => (
                          <option key={d} value={d}>
                            {new Date(`${d}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "short", weekday: "short" })}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-sm text-muted">Интервал</span>
                      <select
                        value={slotStart}
                        onChange={(e) => setSlotStart(e.target.value)}
                        disabled={!deliveryDate}
                        className="mt-1 w-full min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15"
                      >
                        <option value="">{deliveryDate ? "Выберите" : "Сначала дата"}</option>
                        {optionSlots.map((s) => (
                          <option key={s.start} value={s.start}>
                            {s.start}–{s.end}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}

                {!geoActive && options.length === 0 && delivery.zones.filter((z) => z.enabled !== false).length > 1 && (
                  <label className="block">
                    <span className="text-sm text-muted">Зона доставки</span>
                    <select
                      value={zoneName}
                      onChange={(e) => setZoneName(e.target.value)}
                      className="mt-1 w-full min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15"
                    >
                      {delivery.zones
                        .filter((z) => z.enabled !== false)
                        .map((z) => (
                          <option key={z.name} value={z.name}>
                            {z.name} — {tariffLines(z).join(" · ")}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                <label className="block">
                  <span className="text-sm text-muted">Адрес</span>
                  <input
                    ref={addressRef}
                    value={form.address}
                    onChange={(e) => {
                      geoSeq.current += 1; // ответ по старому адресу не нужен
                      setGeo({ status: "idle" });
                      setForm({ ...form, address: e.target.value });
                    }}
                    placeholder="Улица, дом, квартира"
                    autoComplete="off"
                    className="mt-1 w-full min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15"
                  />
                </label>

                {geoActive && (
                  <div className="space-y-2" data-testid="geo-zone">
                    {geo.status === "loading" && (
                      <p className="text-sm text-muted">Определяем зону доставки…</p>
                    )}
                    {geo.status === "zone" && (
                      <p className="text-sm text-green-700">
                        Зона «{geo.zoneName}» — доставка{" "}
                        {geoPrice === 0 ? "бесплатно" : formatPrice(geoPrice)}
                        {geo.deliveryMinutes != null && <span> · ~{geo.deliveryMinutes} мин</span>}
                        {geo.tariffs.length > 1 && (
                          <span className="text-muted">
                            {" "}
                            · {geo.tariffs
                              .filter((t) => t.from > itemsTotal && t.price === 0)
                              .map((t) => `бесплатно от ${t.from.toLocaleString("ru-RU")} ₽`)
                              .join(", ")}
                          </span>
                        )}
                      </p>
                    )}
                    {geo.status === "outside-allowed" && (
                      <p className="text-sm text-amber-700">
                        Адрес вне основных зон — доставка {geoPrice === 0 ? "бесплатно" : formatPrice(geoPrice)},
                        ресторан подтвердит заказ.
                      </p>
                    )}
                    {geo.status === "outside-blocked" && (
                      <p className="text-sm text-red-600">
                        Адрес вне зоны доставки. Выберите самовывоз или уточните адрес.
                      </p>
                    )}
                    {geo.status === "address-not-found" && (
                      <p className="text-sm text-red-600">Адрес не найден — проверьте написание.</p>
                    )}
                    {geo.status === "error" && (
                      <div className="flex items-center gap-3">
                        <p className="text-sm text-red-600">Не удалось проверить адрес.</p>
                        <button
                          type="button"
                          onClick={() => void lookupZone(form.address.trim())}
                          className="text-sm underline min-h-11"
                        >
                          Повторить
                        </button>
                      </div>
                    )}
                    {ymapsKey && (geo.status === "zone" || geo.status === "outside-allowed" || geo.status === "outside-blocked") && (
                      <DeliveryMap
                        ymapsKey={ymapsKey}
                        zones={geoZones.map((z) => ({ name: z.name, polygon: z.polygon! }))}
                        point={{ lat: geo.lat, lng: geo.lng }}
                      />
                    )}
                  </div>
                )}
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
            <fieldset className="space-y-1">
              <legend className="text-sm text-muted mb-1">Как с вами связаться</legend>
              <label className="flex items-center gap-2 min-h-11 text-sm"><input type="radio" name="preferred-channel" checked={preferredChannel === "phone"} onChange={() => setPreferredChannel("phone")}/> Позвонить</label>
              {guestContact.whatsapp && <label className="flex items-center gap-2 min-h-11 text-sm"><input type="radio" name="preferred-channel" checked={preferredChannel === "whatsapp"} onChange={() => setPreferredChannel("whatsapp")}/> WhatsApp</label>}
              {guestContact.telegram && <label className="flex items-center gap-2 min-h-11 text-sm"><input type="radio" name="preferred-channel" checked={preferredChannel === "telegram"} onChange={() => setPreferredChannel("telegram")}/> Telegram</label>}
            </fieldset>
            {cabinetEnabled && (
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
            )}
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
              {bonusSpend > 0 && (
                <div className="flex justify-between text-accent">
                  <span>Бонусы</span>
                  <span>−{Math.min(bonusSpend, maxBonusSpend)} ₽</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-lg pt-1">
                <span>Итого</span>
                <span>{formatPrice(finalTotal)}</span>
              </div>

              {cabinetEnabled && bonusBalance > 0 && (
                <label className="flex items-center justify-between gap-3 pt-1 text-sm">
                  <span className="text-muted">Списать бонусы (доступно {bonusBalance} ₽)</span>
                  <input
                    type="number"
                    min={0}
                    max={maxBonusSpend}
                    value={bonusSpend || ""}
                    placeholder="0"
                    onChange={(e) =>
                      setBonusSpend(Math.max(0, Math.min(Number(e.target.value) || 0, maxBonusSpend)))
                    }
                    className="w-24 min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15 text-right"
                  />
                </label>
              )}

              {paymentProvider !== "none" && (
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setPaymentMethod("cash")}
                    className={`flex-1 min-h-11 rounded-full text-sm font-medium ${paymentMethod === "cash" ? "bg-accent text-white" : "bg-card border border-foreground/15"}`}
                  >
                    При получении
                  </button>
                  <button
                    onClick={() => setPaymentMethod("online")}
                    className={`flex-1 min-h-11 rounded-full text-sm font-medium ${paymentMethod === "online" ? "bg-accent text-white" : "bg-card border border-foreground/15"}`}
                  >
                    Картой онлайн
                  </button>
                </div>
              )}
              <p className="text-muted text-xs pt-1">
                {paymentMethod === "online" ? "Переход к оплате картой после оформления." : "Оплата при получении."} Кэшбэк {loyalty.cashbackPercent}% после выполнения заказа.
              </p>
            </div>

            {error && <p className="text-red-600 text-sm">{error}</p>}

            <div className="flex gap-2">
              <button onClick={() => setStep("cart")} className="min-h-12 px-5 rounded-full border border-foreground/20">
                Назад
              </button>
              <button
                onClick={submit}
                disabled={
                  submitting ||
                  !form.name ||
                  !form.phone ||
                  (type === "delivery" && !form.address) ||
                  (type === "delivery" && geoActive && !geoResolved) ||
                  (type === "delivery" && selectedOption?.mode === "scheduled" && (!deliveryDate || !slotStart))
                }
                className="flex-1 min-h-12 rounded-full bg-accent text-white font-medium text-lg disabled:opacity-50"
              >
                {submitting ? "Отправляю…" : paymentMethod === "online" ? `Оплатить · ${formatPrice(finalTotal)}` : `Заказать · ${formatPrice(finalTotal)}`}
              </button>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="text-center py-8">
            <p className="text-5xl mb-4">✓</p>
            <p className="text-xl font-medium">Заказ №{orderNumber} принят</p>
            <p className="text-muted mt-2">Мы свяжемся с вами выбранным способом для подтверждения.</p>
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
