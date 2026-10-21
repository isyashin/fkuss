"use client";

import { GEO_ADDRESS_ERROR } from "@/lib/delivery/geo-policy";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart/store";
import { checkoutFingerprint, prepareGuestCheckout, useGuestOrders } from "@/lib/order/guest-order-store";
import { dishImageUrl } from "@/lib/assets";
import { DishImage } from "@/components/menu/dish-image";
import { tariffPrice, tariffLines, zoneTariffs, type ZoneTariff } from "@/lib/order/pricing";
import type { ContentSettings } from "@/lib/content-schema";
import type { GuestChannels, PreferredChannel } from "@/lib/guest-contact";
import { normalizeContactPhone } from "@/lib/guest-contact";
import { DeliveryMap } from "@/components/cart/delivery-map";
import { loadYmaps, type YSuggestView } from "@/components/cart/ymaps";

function formatPrice(price: number): string {
  return `${price.toLocaleString("ru-RU")} ₽`;
}

type Step = "cart" | "form";

type FieldErrors = { name?: string; phone?: string; address?: string };

/** Корзина + оформление заказа — нижняя шторка */
export function CartSheet({
  delivery,
  loyalty,
  guestContact,
  paymentProvider = "none",
  bonusBalance = 0,
  cabinetEnabled = false,
  initialAddress = "",
  pickupAddress = "",
  ymapsKey = "",
  onClose,
}: {
  delivery: ContentSettings["delivery"];
  loyalty: ContentSettings["loyalty"];
  guestContact: GuestChannels;
  paymentProvider?: string;
  bonusBalance?: number;
  cabinetEnabled?: boolean;
  initialAddress?: string;
  /** Адрес заведения — показываем гостю в чекауте самовывоза (issue #55). */
  pickupAddress?: string;
  /** Ключ JS API Яндекс Карт (публичный). Пустой — карта и подсказки отключены. */
  ymapsKey?: string;
  onClose: () => void;
}) {
  const { items, setQuantity, total, draftId } = useCart();
  const submittingRef = useRef(false);
  const alive = useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const router = useRouter();
  const [step, setStep] = useState<Step>("cart");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const [type, setType] = useState<"delivery" | "pickup">(delivery.enabled ? "delivery" : "pickup");
  const [zoneName, setZoneName] = useState(
    delivery.zones.find((z) => z.enabled !== false)?.name ?? "",
  );
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "online">("cash");
  const [preferredChannel, setPreferredChannel] = useState<PreferredChannel>("phone");
  const [bonusSpend, setBonusSpend] = useState(0);
  const [form, setForm] = useState({
    city: "", street: initialAddress.includes(",") ? "" : initialAddress, house: "",
    entrance: "", apartment: "", intercom: "",
    name: "", phone: "", email: "", comment: "", website: "",
  });

  // Варианты доставки и окна (если настроены)
  const [options, setOptions] = useState<{
    id: string;
    name: string;
    mode: "asap" | "scheduled";
    price: number;
    freeFrom: number | null;
    available: boolean;
    windows: { date: string; start: string; end: string }[];
  }[]>([]);
  const [deliveryOptionId, setDeliveryOptionId] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [slotStart, setSlotStart] = useState("");
  const [asapAvailable, setAsapAvailable] = useState<boolean | null>(null);
  const [availabilityError, setAvailabilityError] = useState(false);

  // Предзаказ ко времени из настроек (самовывоз / доставка без вариантов)
  const [preOrder, setPreOrder] = useState<{ enabled: boolean; slots: { date: string; time: string }[] }>({
    enabled: false,
    slots: [],
  });
  const [preOrderMode, setPreOrderMode] = useState<"asap" | "scheduled">("asap");
  const [preOrderDate, setPreOrderDate] = useState("");
  const [preOrderTime, setPreOrderTime] = useState("");

  useEffect(() => {
    fetch("/api/delivery/slots")
      .then((r) => { if (!r.ok) throw new Error("availability"); return r.json(); })
      .then((data) => {
        const opts = data.options ?? [];
        setOptions(opts);
        // F03: выбираем первый доступный — недоступные варианты не предлагаем.
        setDeliveryOptionId(opts.find((o: { available?: boolean }) => o.available)?.id ?? "");
        setPreOrder(data.preOrder ?? { enabled: false, slots: [] });
        setAsapAvailable(data.asapAvailable !== false);
        if (data.asapAvailable === false && data.preOrder?.enabled && data.preOrder.slots?.length) setPreOrderMode("scheduled");
      })
      .catch(() => setAvailabilityError(true));
  }, []);

  const itemsTotal = total();
  // Минимальная сумма действует только для доставки (у самовывоза отдельного поля нет)
  const minOrder = type === "delivery" ? delivery.minOrder : 0;
  const belowMinOrder = minOrder > 0 && itemsTotal < minOrder;
  const minOrderShort = belowMinOrder ? minOrder - itemsTotal : 0;
  const selectedOption = options.find((o) => o.id === deliveryOptionId);
  // F03: если варианты настроены, но все недоступны сегодня — объясняем до отправки.
  const noDeliveryAvailable = options.length > 0 && !selectedOption;
  // F03: если все варианты доставки недоступны сегодня — сразу переключаем
  // гостя на самовывоз, чтобы итог и следующий шаг не вводили в заблуждение.
  // Корректировка состояния во время рендера (react-compiler: не setState в эффекте).
  const [prevNoDelivery, setPrevNoDelivery] = useState(false);
  if (noDeliveryAvailable !== prevNoDelivery) {
    setPrevNoDelivery(noDeliveryAvailable);
    if (noDeliveryAvailable && type === "delivery") setType("pickup");
  }
  const zone = delivery.zones.find((z) => z.name === zoneName);

  // Зоны на карте: автоопределение зоны по адресу вместо выбора из списка.
  // География обязательна и с вариантами доставки; вариант задаёт только цену/время.
  const geoZones = delivery.zones.filter((z) => z.enabled !== false && (z.polygon?.length ?? 0) >= 3);
  const geoActive = Boolean(delivery.geo?.enabled);

  type GeoState =
    | { status: "idle" | "loading" | "address-not-found" | "address-imprecise" | "configuration-error" | "error" }
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
        case "address-imprecise":
          setGeo({ status: "address-imprecise" });
          break;
        case "configuration-error":
          setGeo({ status: "configuration-error" });
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

  const geoAddress = [form.city, form.street, form.house].map((s) => s.trim()).filter(Boolean).join(", ");

  // Определение зоны с задержкой, чтобы не дёргать геокодер на каждую букву.
  // Сброс состояния — в onChange адреса (ниже), здесь только планируем запрос.
  useEffect(() => {
    if (!geoActive || type !== "delivery") return;
    if (!form.city.trim() || !form.street.trim() || !form.house.trim()) return;
    const address = geoAddress;
    if (address.length < 6) return;
    const timer = setTimeout(() => void lookupZone(address), 600);
    return () => clearTimeout(timer);
  }, [geoActive, type, form.city, form.street, form.house, geoAddress, lookupZone]);

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
            const item = e.get("item") as { value?: string; displayName?: string } | undefined;
            if (item?.value) {
              const street = item.displayName || item.value;
              // Повторный выбор того же адреса не запускает effect и не должен сбрасывать зону.
              if (street === addressRef.current?.value) return;
              geoSeq.current += 1;
              setGeo({ status: "idle" });
              // displayName — короткая форма (улица без города/региона)
              setForm((f) => ({ ...f, street }));
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
  const deliveryPending = type === "delivery" && (asapAvailable === null || (geoActive && !geoResolved));
  const deliveryQuoteText = geo.status === "loading" ? "Рассчитываем…"
    : geo.status === "outside-blocked" ? "Адрес вне зоны"
    : geo.status === "address-not-found" ? "Адрес не найден"
    : geo.status === "error" ? "Не удалось рассчитать" : "Рассчитаем по адресу";

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

  // Предзаказ: самовывоз всегда, доставка — только без настроенных вариантов
  // (варианты со scheduled-режимом уже дают выбор времени доставки)
  const preOrderApplicable =
    preOrder.enabled && preOrder.slots.length > 0 && (type === "pickup" || options.length === 0);
  // Сброс выбора, когда предзаказ перестал применяться (варианты доставки подгрузились)
  const [prevPreOrderApplicable, setPrevPreOrderApplicable] = useState(false);
  if (preOrderApplicable !== prevPreOrderApplicable) {
    setPrevPreOrderApplicable(preOrderApplicable);
    if (!preOrderApplicable && preOrderMode !== "asap") {
      setPreOrderMode("asap");
      setPreOrderDate("");
      setPreOrderTime("");
    }
  }
  const preOrderSelected = preOrderApplicable && preOrderMode === "scheduled";
  const asapBlocked = asapAvailable === false && !preOrderSelected && !(type === "delivery" && selectedOption?.mode === "scheduled");
  const preOrderDates = [...new Set(preOrder.slots.map((s) => s.date))];
  const preOrderTimes = preOrder.slots.filter((s) => s.date === preOrderDate);

  // Кнопка активна всегда: недозаполненные поля подсвечиваем по нажатию,
  // чтобы гость видел, что именно не так (issue #59).
  function validateForm(): boolean {
    const errors: FieldErrors = {};
    if (!form.name.trim()) errors.name = "Укажите имя";
    if (!form.phone.trim()) errors.phone = "Укажите телефон";
    else if (!normalizeContactPhone(form.phone)) errors.phone = "Укажите корректный телефон с кодом страны";
    if (type === "delivery" && (!form.city.trim() || !form.street.trim() || !form.house.trim())) {
      errors.address = "Заполните город, улицу и дом";
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function submit() {
    if (submittingRef.current) return;
    setError("");
    if (!validateForm()) return;
    submittingRef.current = true;
    setSubmitting(true);
    // Слоты доставки отправляем только для доставки с выбранным окном:
    // иначе самовывоз с scheduled-вариантом в настройках шлёт пустую дату
    // и серверная схема отклоняет заказ.
    const scheduledDelivery = type === "delivery" && selectedOption?.mode === "scheduled";
    const addressExtras = [
      form.entrance.trim() && `подъезд ${form.entrance.trim()}`,
      form.apartment.trim() && `кв. ${form.apartment.trim()}`,
      form.intercom.trim() && `домофон ${form.intercom.trim()}`,
    ].filter(Boolean).join(", ");
    const fullAddress = addressExtras ? `${geoAddress}, ${addressExtras}` : geoAddress;
    try {
      const payload = {
          items: items.map((i) => ({
            dishId: i.dishId,
            quantity: i.quantity,
            modifierIds: i.modifiers.map((m) => m.id),
          })),
          type,
          zoneName: type === "delivery" ? zoneName : null,
          address: fullAddress,
          addressCity: form.city.trim(),
          addressStreet: form.street.trim(),
          addressHouse: form.house.trim(),
          addressEntrance: form.entrance.trim(),
          addressApartment: form.apartment.trim(),
          addressIntercom: form.intercom.trim(),
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
          preOrderDate: preOrderSelected ? preOrderDate : null,
          preOrderTime: preOrderSelected ? preOrderTime : null,
      };
      await prepareGuestCheckout();
      const key = useCart.getState().beginCheckout(await checkoutFingerprint(payload), draftId);
      const response = await fetch("/api/order", { method:"POST", headers:{"Content-Type":"application/json","Idempotency-Key":key}, body:JSON.stringify(payload) });
      const data = await response.json();
      // Commit the server acknowledgement before navigating to any payment provider.
      if (!response.ok && !data.createdOrder && response.status<500) useCart.getState().rejectCheckout(key);
      if (data.createdOrder && data.order) {
        useGuestOrders.getState().receive([data.order]);
        if (!alive.current) return;
        if (!response.ok) { onClose(); router.push(`/order/success?n=${data.orderNumber}`); return; }
      }
      if (!alive.current) return;
      if (!response.ok) {
        setError(data.error ?? "Ошибка оформления");
        return;
      }
      // Онлайн-оплата: уходим на страницу оплаты провайдера
      if (data.confirmationUrl) {
        globalThis.location.assign(data.confirmationUrl);
        return;
      }
      // Оплата при получении: общий success-экран, как после онлайн-оплаты.
      onClose();
      router.push(`/order/success?n=${data.orderNumber}`);
    } catch {
      setError("Нет связи. Попробуйте ещё раз.");
    } finally {
      submittingRef.current = false;
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
          </h2>
          <button onClick={onClose} className="min-w-11 min-h-11 text-xl" aria-label="Закрыть">
            ×
          </button>
        </div>

        {step === "cart" && (
          items.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-lg font-medium">Корзина пуста</p>
              <p className="text-muted mt-1">Загляните в меню — выберите блюда.</p>
              <button
                onClick={onClose}
                className="mt-5 min-h-12 px-8 rounded-full bg-accent text-white font-medium"
              >
                К меню
              </button>
            </div>
          ) : (
          <>
            <div className="space-y-3">
              {items.map((item) => {
                const lineTotal =
                  (item.price + item.modifiers.reduce((s, m) => s + m.price, 0)) * item.quantity;
                return (
                  <div key={`${item.dishId}:${item.modifiers.map((m) => m.id).join(",")}`} className="flex gap-3 items-center">
                    <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-foreground/5 shrink-0">
                      <DishImage src={dishImageUrl(item.image, "sm")} alt={item.name} className="absolute inset-0 w-full h-full" imageClassName="object-cover" />
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
            {belowMinOrder && (
              <p className="text-red-600 text-sm mt-4">
                Минимальная сумма заказа для доставки {formatPrice(minOrder)} — добавьте ещё{" "}
                {formatPrice(minOrderShort)}.
              </p>
            )}
            <button
              onClick={() => setStep("form")}
              className="mt-5 w-full min-h-12 rounded-full bg-accent text-white font-medium text-lg disabled:opacity-50"
            >
              Оформить · {formatPrice(itemsTotal)}
            </button>
          </>
          )
        )}

        {step === "form" && (
          <div className="space-y-4 checkout-form">
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

            {type === "pickup" && pickupAddress && (
              <p className="text-sm text-muted" data-testid="pickup-address">
                Пункт самовывоза: {pickupAddress}
              </p>
            )}

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
                        <option key={o.id} value={o.id} disabled={!o.available}>
                          {o.name} — {o.mode === "asap" ? "как можно скорее" : "к выбранному времени"} ·{" "}
                          {o.freeFrom !== null ? `бесплатно от ${o.freeFrom} ₽` : `${o.price} ₽`}
                          {!o.available ? " · сегодня недоступно" : ""}
                        </option>
                      ))}
                    </select>
                    {noDeliveryAvailable && (
                      <span className="mt-1 block text-sm text-red-600">
                        Сегодня доставка недоступна по всем вариантам — выберите самовывоз.
                      </span>
                    )}
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
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ["city", "Город", true],
                    ["street", "Улица", true],
                    ["house", "Дом", false],
                    ["entrance", "Подъезд", false],
                    ["apartment", "Квартира", false],
                    ["intercom", "Домофон", false],
                  ] as const).map(([key, label, wide]) => (
                    <label key={key} className={`block ${wide ? "col-span-2" : ""}`}>
                      <span className="text-sm text-muted" data-required={["city", "street", "house"].includes(key) ? "" : undefined}>
                        {label}
                      </span>
                      <input
                        ref={key === "street" ? addressRef : undefined}
                        value={form[key]}
                        onChange={(e) => {
                          if (key === "city" || key === "street" || key === "house") {
                            geoSeq.current += 1; // ответ по старому адресу не нужен
                            setGeo({ status: "idle" });
                          }
                          setForm({ ...form, [key]: e.target.value });
                          if (fieldErrors.address) setFieldErrors((current) => ({ ...current, address: undefined }));
                        }}
                        autoComplete="off"
                        className="mt-1 w-full min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15"
                      />
                    </label>
                  ))}
                  {fieldErrors.address && <p role="alert" className="col-span-2 text-red-600 text-sm mt-1">{fieldErrors.address}</p>}
                </div>

                {geoActive && (
                  <div className="space-y-2" data-testid="geo-zone">
                    {geo.status === "loading" && (
                      <p className="text-sm text-muted">Определяем зону доставки…</p>
                    )}
                    {geo.status === "zone" && (
                      <p className="text-sm text-green-700">
                        Зона «{geo.zoneName}» — доставка{" "}
                        {deliveryPrice === 0 ? "бесплатно" : formatPrice(deliveryPrice)}
                        {!selectedOption && geo.deliveryMinutes != null && <span> · ~{geo.deliveryMinutes} мин</span>}
                        {!selectedOption && geo.tariffs.length > 1 && (
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
                        Адрес вне основных зон — доставка {deliveryPrice === 0 ? "бесплатно" : formatPrice(deliveryPrice)},
                        ресторан подтвердит заказ.
                      </p>
                    )}
                    {geo.status === "outside-blocked" && (
                      <p className="text-sm text-red-600">
                        Адрес вне зоны доставки. Выберите самовывоз или уточните адрес.
                      </p>
                    )}
                    {geo.status === "address-imprecise" && (
                      <p className="text-sm text-red-600">{GEO_ADDRESS_ERROR}</p>
                    )}
                    {geo.status === "configuration-error" && (
                      <p className="text-sm text-red-600">Доставка по карте временно недоступна. Выберите самовывоз.</p>
                    )}
                    {geo.status === "address-not-found" && (
                      <p className="text-sm text-red-600">Адрес не найден — проверьте написание.</p>
                    )}
                    {geo.status === "error" && (
                      <div className="flex items-center gap-3">
                        <p className="text-sm text-red-600">Не удалось проверить адрес.</p>
                        <button
                          type="button"
                          onClick={() => void lookupZone(geoAddress)}
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

            {preOrderApplicable && (
              <fieldset className="space-y-1">
                <legend className="text-sm text-muted mb-1">
                  Время {type === "delivery" ? "доставки" : "самовывоза"}
                </legend>
                <label className="flex items-center gap-2 min-h-11 text-sm">
                  <input
                    type="radio"
                    name="preorder-mode"
                    checked={preOrderMode === "asap"}
                    disabled={asapAvailable === false}
                    onChange={() => setPreOrderMode("asap")}
                  />
                  Как можно скорее
                </label>
                <label className="flex items-center gap-2 min-h-11 text-sm">
                  <input
                    type="radio"
                    name="preorder-mode"
                    checked={preOrderMode === "scheduled"}
                    onChange={() => setPreOrderMode("scheduled")}
                  />
                  Предзаказ ко времени
                </label>
                {preOrderMode === "scheduled" && (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-sm text-muted">Дата</span>
                      <select
                        value={preOrderDate}
                        onChange={(e) => {
                          setPreOrderDate(e.target.value);
                          setPreOrderTime("");
                        }}
                        className="mt-1 w-full min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15"
                      >
                        <option value="">Выберите</option>
                        {preOrderDates.map((d) => (
                          <option key={d} value={d}>
                            {new Date(`${d}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "short", weekday: "short" })}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-sm text-muted">Время</span>
                      <select
                        value={preOrderTime}
                        onChange={(e) => setPreOrderTime(e.target.value)}
                        disabled={!preOrderDate}
                        className="mt-1 w-full min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15"
                      >
                        <option value="">{preOrderDate ? "Выберите" : "Сначала дата"}</option>
                        {preOrderTimes.map((s) => (
                          <option key={s.time} value={s.time}>
                            {s.time}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
              </fieldset>
            )}

            <label className="block">
              <span className="text-sm text-muted">Имя</span>
              <input
                value={form.name}
                onChange={(e) => {
                  setForm({ ...form, name: e.target.value });
                  if (fieldErrors.name) setFieldErrors((current) => ({ ...current, name: undefined }));
                }}
                autoComplete="name"
                className="mt-1 w-full min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15"
              />
              {fieldErrors.name && <p role="alert" className="text-red-600 text-sm mt-1">{fieldErrors.name}</p>}
            </label>
            <label className="block">
              <span className="text-sm text-muted">Телефон</span>
              <input
                value={form.phone}
                onChange={(e) => {
                  setForm({ ...form, phone: e.target.value });
                  if (fieldErrors.phone) setFieldErrors((current) => ({ ...current, phone: undefined }));
                }}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+7 ___ ___-__-__"
                className="mt-1 w-full min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15"
              />
              {fieldErrors.phone && <p role="alert" className="text-red-600 text-sm mt-1">{fieldErrors.phone}</p>}
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
                <span>{deliveryPending ? deliveryQuoteText : type === "pickup" ? "Самовывоз" : deliveryPrice === 0 ? "бесплатно" : formatPrice(deliveryPrice)}</span>
              </div>
              {bonusSpend > 0 && (
                <div className="flex justify-between text-accent">
                  <span>Бонусы</span>
                  <span>−{Math.min(bonusSpend, maxBonusSpend)} ₽</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-lg pt-1">
                <span>{deliveryPending ? "Без доставки" : "Итого"}</span>
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
            {asapBlocked && <p role="status" className="text-muted text-sm">Ресторан сейчас закрыт. Выберите доступное время предзаказа или вернитесь в часы работы.</p>}
            {availabilityError && <p role="alert" className="text-red-600 text-sm">Не удалось проверить доступность заказа. Закройте корзину и попробуйте снова.</p>}
            {belowMinOrder && (
              <p className="text-red-600 text-sm">
                Минимальная сумма заказа для доставки {formatPrice(minOrder)} — не хватает{" "}
                {formatPrice(minOrderShort)}.
              </p>
            )}

            {/* Issue #58: sticky-футер — submit виден без прокрутки до конца формы на mobile */}
            <div className="sticky -bottom-4 -mx-4 px-4 pb-4 pt-2 bg-background border-t border-foreground/10 flex gap-2">
              <button onClick={() => setStep("cart")} className="min-h-12 px-5 rounded-full border border-foreground/20">
                Назад
              </button>
              <button
                onClick={submit}
                disabled={
                  submitting ||
                  asapAvailable === null || asapBlocked ||
                  belowMinOrder ||
                  (type === "delivery" && geoActive && !geoResolved) ||
                  (type === "delivery" && noDeliveryAvailable) ||
                  (type === "delivery" && selectedOption?.mode === "scheduled" && (!deliveryDate || !slotStart)) ||
                  (preOrderSelected && (!preOrderDate || !preOrderTime))
                }
                className="flex-1 min-h-12 rounded-full bg-accent text-white font-medium text-lg disabled:opacity-50"
              >
                {submitting ? "Отправляю…" : deliveryPending ? "Заказать" : paymentMethod === "online" ? `Оплатить · ${formatPrice(finalTotal)}` : `Заказать · ${formatPrice(finalTotal)}`}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
