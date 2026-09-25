"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { saveAllAdminSettings, saveGuestContactChannels } from "./actions";
import { contentAssetUrl } from "@/lib/assets";
import type { ContentSettings } from "@/lib/content-schema";
import type { ThemeConfig } from "@/lib/content";
import styles from "./settings-admin.module.css";
import type { PublicAdminSound } from "@/lib/admin-sound";
import { SoundSettings } from "./sound-settings";
import { visibleGuestChannels, type GuestChannels } from "@/lib/guest-contact";

const PRESETS = [
  { id: "warm", name: "Тёплый (трактир)" },
  { id: "minimal", name: "Минимальный" },
  { id: "elegant", name: "Тёмный (fine dining)" },
];

export function SettingsAdmin({ settings, theme, sound }: { settings: ContentSettings; theme: ThemeConfig; sound: PublicAdminSound }) {
  const [s, setS] = useState({ ...settings, guestContact: visibleGuestChannels(settings) });
  const [contactSaving, setContactSaving] = useState(false);
  const [contactError, setContactError] = useState("");
  const [preset, setPreset] = useState(theme.preset);
  const [accent, setAccent] = useState(theme.accent);
  const [pricingMode, setPricingMode] = useState<"yandex" | "manual" | "coefficient">(settings.pricing.globalMode);
  const [pricingPercent, setPricingPercent] = useState(settings.pricing.globalPercent);
  const [bg, setBg] = useState({
    enabled: theme.background?.enabled ?? false,
    image: theme.background?.image ?? "",
    position: theme.background?.position ?? "center",
    dimPercent: theme.background?.dimPercent ?? 40,
    disableOnMobile: theme.background?.disableOnMobile ?? true,
  });
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");

  const inputCls = "mt-1 w-full min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15";

  function saveAll() {
    startTransition(async () => {
      setError(""); setSaved("");
      try {
        await saveAllAdminSettings({ settings: s, theme: { preset, accent }, pricing: { globalMode: pricingMode, globalPercent: pricingPercent }, background: bg });
        setSaved("Сохранено ✓");
        setTimeout(() => setSaved(""), 3000);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Не удалось сохранить настройки");
      }
    });
  }

  async function changeGuestContact(channel: keyof GuestChannels, enabled: boolean) {
    const previous = s.guestContact;
    const next = { ...previous, [channel]: enabled };
    setContactSaving(true);
    setContactError("");
    setS((current) => ({ ...current, guestContact: next }));
    try { await saveGuestContactChannels(next); }
    catch (cause) {
      setS((current) => ({ ...current, guestContact: previous }));
      setContactError(cause instanceof Error ? cause.message : "Не удалось сохранить каналы связи");
    } finally { setContactSaving(false); }
  }

  return (
    <div className={styles.page}>
      <div className={styles.intro}><span>Управление</span><h1>Настройки</h1><p>Параметры сайта текущего ресторана. Тема панели переключается в верхней строке и не меняет гостевой сайт.</p></div>
      <div className={styles.saveBar}>
        <button
          onClick={saveAll}
          disabled={pending}
          className="min-h-12 px-8 rounded-full bg-accent text-white font-medium disabled:opacity-50 shadow-lg"
        >
          {pending ? "Сохраняю…" : "Сохранить всё"}
        </button>
        {saved && <span className="text-green-600">{saved}</span>}
        {error && <span className={styles.error} role="alert">{error}</span>}
      </div>
      <SoundSettings initial={sound}/>
      <section className={styles.card} id="site-theme">
        <h2 className="text-xl mb-3">Оформление сайта</h2>
        <div className="space-y-3">
          <label className="block">
            <span className="text-sm text-muted">Пресет</span>
            <select value={preset} onChange={(e) => setPreset(e.target.value as typeof preset)} className={inputCls}>
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm text-muted">Фирменный цвет</span>
            <input type="color" value={accent} onChange={(e) => setAccent(e.target.value)} className="mt-1 w-16 h-11 rounded" />
          </label>
        </div>
      </section>

      <section className={styles.card} id="background">
        <h2 className="text-xl mb-3">Фоновое изображение</h2>
        <div className="space-y-3">
          <label className="flex items-center gap-3 min-h-11">
            <input
              type="checkbox"
              checked={bg.enabled}
              onChange={(e) => setBg({ ...bg, enabled: e.target.checked })}
              className="w-5 h-5 accent-[var(--accent)]"
            />
            Фон включён
          </label>

          <div className={styles.wrapActions}>
            <label className="min-h-11 px-4 inline-flex items-center rounded-full bg-accent text-white text-sm cursor-pointer">
              {bg.image ? "Заменить изображение" : "Загрузить изображение"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const fd = new FormData();
                  fd.append("file", file);
                  fd.append("section", "background");
                  fd.append("name", `bg-${Date.now().toString(36)}`);
                  const response = await fetch("/api/admin/upload", { method: "POST", body: fd });
                  const data = await response.json();
                  if (response.ok) setBg({ ...bg, image: data.path });
                  else alert(data.error ?? "Ошибка загрузки");
                }}
              />
            </label>
            {bg.image && (
              <button
                onClick={() => setBg({ ...bg, image: "" })}
                className="min-h-11 px-4 rounded-full border border-red-300 text-red-600 text-sm"
              >
                Удалить
              </button>
            )}
          </div>

          {bg.image && (
            <div className="rounded-[var(--radius)] overflow-hidden border border-foreground/15 max-w-sm">
              <img src={contentAssetUrl(bg.image)} alt="Фон — превью" className="w-full h-32 object-cover" />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm text-muted">Позиция</span>
              <select value={bg.position} onChange={(e) => setBg({ ...bg, position: e.target.value as typeof bg.position })} className={inputCls}>
                <option value="center">По центру</option>
                <option value="top">Сверху</option>
                <option value="bottom">Снизу</option>
              </select>
            </label>
            <label className="block">
              <span className="text-sm text-muted">Затемнение: {bg.dimPercent}%</span>
              <input
                type="range"
                min={0}
                max={100}
                value={bg.dimPercent}
                onChange={(e) => setBg({ ...bg, dimPercent: Number(e.target.value) })}
                className="mt-3 w-full accent-[var(--accent)]"
              />
            </label>
          </div>

          <label className="flex items-center gap-3 min-h-11">
            <input
              type="checkbox"
              checked={bg.disableOnMobile}
              onChange={(e) => setBg({ ...bg, disableOnMobile: e.target.checked })}
              className="w-5 h-5 accent-[var(--accent)]"
            />
            Отключить фон на мобильных
          </label>
        </div>
      </section>

      <section className={styles.card} id="delivery">
        <h2 className="text-xl mb-3">Доставка</h2>
        <div className="space-y-3">
          <label className="flex items-center gap-3 min-h-11">
            <input
              type="checkbox"
              checked={s.delivery.enabled}
              onChange={(e) => setS({ ...s, delivery: { ...s.delivery, enabled: e.target.checked } })}
              className="w-5 h-5 accent-[var(--accent)]"
            />
            Доставка включена
          </label>
          <label className="flex items-center gap-3 min-h-11">
            <input
              type="checkbox"
              checked={s.delivery.pickupEnabled}
              onChange={(e) => setS({ ...s, delivery: { ...s.delivery, pickupEnabled: e.target.checked } })}
              className="w-5 h-5 accent-[var(--accent)]"
            />
            Самовывоз включён
          </label>
          <label className="block">
            <span className="text-sm text-muted">Минимальная сумма заказа, ₽</span>
            <input
              type="number"
              min={0}
              step={1}
              value={s.delivery.minOrder}
              onChange={(e) => setS({ ...s, delivery: { ...s.delivery, minOrder: Number(e.target.value) } })}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-sm text-muted">Часовой пояс ресторана</span>
            <select
              value={s.timezone}
              onChange={(e) => setS({ ...s, timezone: e.target.value })}
              className={inputCls}
            >
              <option value="Europe/Kaliningrad">Калининград (UTC+2)</option>
              <option value="Europe/Moscow">Москва (UTC+3)</option>
              <option value="Europe/Samara">Самара (UTC+4)</option>
              <option value="Asia/Yekaterinburg">Екатеринбург (UTC+5)</option>
              <option value="Asia/Omsk">Омск (UTC+6)</option>
              <option value="Asia/Krasnoyarsk">Красноярск (UTC+7)</option>
              <option value="Asia/Irkutsk">Иркутск (UTC+8)</option>
              <option value="Asia/Yakutsk">Якутск (UTC+9)</option>
              <option value="Asia/Vladivostok">Владивосток (UTC+10)</option>
              <option value="Asia/Kamchatka">Камчатка (UTC+12)</option>
            </select>
          </label>

          {s.delivery.zones.map((zone, i) => (
            <div key={i} className={styles.zoneRow}>
              <input
                value={zone.name}
                aria-label={`Название зоны ${i + 1}`}
                onChange={(e) => {
                  const zones = [...s.delivery.zones];
                  zones[i] = { ...zone, name: e.target.value };
                  setS({ ...s, delivery: { ...s.delivery, zones } });
                }}
                className="flex-1 min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15"
              />
              <input
                type="number"
                min={0}
                step={1}
                value={zone.price}
                title="Цена доставки"
                aria-label={`Цена доставки зоны ${i + 1}, ₽`}
                onChange={(e) => {
                  const zones = [...s.delivery.zones];
                  zones[i] = { ...zone, price: Number(e.target.value) };
                  setS({ ...s, delivery: { ...s.delivery, zones } });
                }}
                className="w-24 min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15"
              />
              <input
                type="number"
                min={0}
                step={1}
                value={zone.freeFrom ?? ""}
                placeholder="Беспл. от"
                title="Бесплатно от"
                aria-label={`Бесплатно от для зоны ${i + 1}, ₽`}
                onChange={(e) => {
                  const zones = [...s.delivery.zones];
                  zones[i] = { ...zone, freeFrom: e.target.value === "" ? null : Number(e.target.value) };
                  setS({ ...s, delivery: { ...s.delivery, zones } });
                }}
                className="w-28 min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15"
              />
              <button type="button" onClick={() => setS({ ...s, delivery: { ...s.delivery, zones: s.delivery.zones.filter((_, index) => index !== i) } })}>Удалить зону</button>
            </div>
          ))}
          <button
            onClick={() => setS({ ...s, delivery: { ...s.delivery, zones: [...s.delivery.zones, { name: "Новая зона", price: 300, freeFrom: null }] } })}
            className="min-h-11 px-4 rounded-full border border-dashed border-foreground/30 text-sm text-muted"
          >
            + Зона
          </button>
        </div>
      </section>

      <section className={styles.card} id="pricing">
        <h2 className="text-xl mb-3">Ценообразование (общее)</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-muted">Режим цен меню</span>
            <select value={pricingMode} onChange={(e) => setPricingMode(e.target.value as "yandex" | "manual" | "coefficient")} className={inputCls}>
              <option value="yandex">Цена Яндекс.Еды</option>
              <option value="manual">Ручные цены</option>
              <option value="coefficient">Яндекс ± %</option>
            </select>
          </label>
          {pricingMode === "coefficient" && (
            <label className="block">
              <span className="text-sm text-muted">Коэффициент, %</span>
              <input
                type="number"
                value={pricingPercent}
                onChange={(e) => setPricingPercent(Number(e.target.value))}
                className={inputCls}
              />
            </label>
          )}
        </div>
        <p className="text-muted text-xs mt-2">
          Индивидуальный режим блюда приоритетнее общего. Коэффициент действует и на платные добавки без ручной цены.
        </p>
      </section>

      <section className={styles.card} id="payment">
        <h2 className="text-xl mb-3">Оплата</h2>
        <label className="block">
          <span className="text-sm text-muted">Онлайн-оплата заказов</span>
          <select
            value={s.payment.provider}
            onChange={(e) => setS({ ...s, payment: { ...s.payment, provider: e.target.value as typeof s.payment.provider } })}
            className={inputCls}
          >
            <option value="none">выключена (только при получении)</option>
            <option value="mock">тестовый провайдер</option>
            <option value="yookassa">ЮKassa</option>
          </select>
        </label>
        <p className="text-muted text-xs mt-2">
          Ключи провайдера — в env сайта ({s.payment.shopIdRef}, {s.payment.secretRef}), не в админке.
        </p>
      </section>

      <section className={styles.card} id="loyalty">
        <h2 className="text-xl mb-3">Лояльность</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-muted">Кэшбэк, %</span>
            <input
              type="number"
              min={0}
              max={100}
              value={s.loyalty.cashbackPercent}
              onChange={(e) => setS({ ...s, loyalty: { ...s.loyalty, cashbackPercent: Number(e.target.value) } })}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="text-sm text-muted">Списание до, %</span>
            <input
              type="number"
              min={0}
              max={100}
              value={s.loyalty.maxSpendPercent}
              onChange={(e) => setS({ ...s, loyalty: { ...s.loyalty, maxSpendPercent: Number(e.target.value) } })}
              className={inputCls}
            />
          </label>
        </div>
      </section>

      <section className={styles.card} id="guest-contact">
        <h2>Связь с гостями</h2>
        <p className={styles.soundHint}>Ручные ссылки в заказах и бронях. Если выбранный гостем канал скрыт, сотрудник видит только номер телефона.</p>
        <label className="flex items-center gap-3 min-h-11">
          <input type="checkbox" checked={s.guestContact.whatsapp} disabled={contactSaving} onChange={(event) => void changeGuestContact("whatsapp", event.target.checked)} className="w-5 h-5 accent-[var(--accent)]"/>
          WhatsApp
        </label>
        <label className="flex items-center gap-3 min-h-11">
          <input type="checkbox" checked={s.guestContact.telegram} disabled={contactSaving} onChange={(event) => void changeGuestContact("telegram", event.target.checked)} className="w-5 h-5 accent-[var(--accent)]"/>
          Telegram
        </label>
        {contactError && <p role="alert" className={styles.error}>{contactError}</p>}
      </section>

      <section className={styles.card} id="channels">
        <h2 className="text-xl mb-3">Каналы уведомлений</h2>
        <div className="space-y-3">
          <label className="flex items-center gap-3 min-h-11">
            <input
              type="checkbox"
              checked={s.channels.telegram.enabled}
              onChange={(e) => setS({ ...s, channels: { ...s.channels, telegram: { ...s.channels.telegram, enabled: e.target.checked } } })}
              className="w-5 h-5 accent-[var(--accent)]"
            />
            Telegram (токен в secrets, chat_id ниже)
          </label>
          {s.channels.telegram.enabled && (
            <input
              value={s.channels.telegram.chatId}
              onChange={(e) => setS({ ...s, channels: { ...s.channels, telegram: { ...s.channels.telegram, chatId: e.target.value } } })}
              placeholder="chat_id группы"
              className={inputCls}
            />
          )}
          <label className="flex items-center gap-3 min-h-11">
            <input
              type="checkbox"
              checked={s.channels.max.enabled}
              onChange={(e) => setS({ ...s, channels: { ...s.channels, max: { ...s.channels.max, enabled: e.target.checked } } })}
              className="w-5 h-5 accent-[var(--accent)]"
            />
            MAX (токен в secrets, chat_id ниже)
          </label>
          {s.channels.max.enabled && (
            <input
              value={s.channels.max.chatId}
              onChange={(e) => setS({ ...s, channels: { ...s.channels, max: { ...s.channels.max, chatId: e.target.value } } })}
              placeholder="chat_id чата MAX"
              className={inputCls}
            />
          )}
          <label className="flex items-center gap-3 min-h-11">
            <input
              type="checkbox"
              checked={s.channels.email.enabled}
              onChange={(e) => setS({ ...s, channels: { ...s.channels, email: { ...s.channels.email, enabled: e.target.checked } } })}
              className="w-5 h-5 accent-[var(--accent)]"
            />
            Email для заказов
          </label>
          {s.channels.email.enabled && (
            <input
              value={s.channels.email.address}
              onChange={(e) => setS({ ...s, channels: { ...s.channels, email: { ...s.channels.email, address: e.target.value } } })}
              placeholder="orders@example.ru"
              className={inputCls}
            />
          )}
          <label className="flex items-center gap-3 min-h-11">
            <input
              type="checkbox"
              checked={s.channels.whatsapp.enabled}
              onChange={(e) => setS({ ...s, channels: { ...s.channels, whatsapp: { ...s.channels.whatsapp, enabled: e.target.checked } } })}
              className="w-5 h-5 accent-[var(--accent)]"
            />
            Кнопка «Дублировать в WhatsApp»
          </label>
          {s.channels.whatsapp.enabled && (
            <input
              value={s.channels.whatsapp.phone}
              onChange={(e) => setS({ ...s, channels: { ...s.channels, whatsapp: { ...s.channels.whatsapp, phone: e.target.value } } })}
              placeholder="+79991234567"
              className={inputCls}
            />
          )}
        </div>
      </section>

      <section className={styles.card} id="booking">
        <h2 className="text-xl mb-3">Бронирование</h2>
        <label className="flex items-center gap-3 min-h-11">
          <input
            type="checkbox"
            checked={s.booking.enabled}
            onChange={(e) => setS({ ...s, booking: { ...s.booking, enabled: e.target.checked } })}
            className="w-5 h-5 accent-[var(--accent)]"
          />
          Бронирование включено
        </label>
        {s.booking.enabled && (
          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="text-sm text-muted">Шаг слота, мин</span>
              <input
                type="number"
                min={15}
                max={180}
                value={s.booking.slotMinutes}
                onChange={(e) => setS({ ...s, booking: { ...s.booking, slotMinutes: Number(e.target.value) } })}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="text-sm text-muted">Гостей на слот, макс</span>
              <input
                type="number"
                min={1}
                value={s.booking.maxGuestsPerSlot}
                onChange={(e) => setS({ ...s, booking: { ...s.booking, maxGuestsPerSlot: Number(e.target.value) } })}
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="text-sm text-muted">Не раньше, ч.</span>
              <input
                type="number"
                min={0}
                value={s.booking.minHoursAhead}
                onChange={(e) => setS({ ...s, booking: { ...s.booking, minHoursAhead: Number(e.target.value) } })}
                className={inputCls}
              />
            </label>
          </div>
        )}
      </section>

      <section className={styles.more} aria-label="Другие настройки ресторана">
        <h2>Другие разделы</h2><p>Каждый раздел сохраняет изменения на сервере и сразу обновляет сайт.</p>
        <div className={styles.links}>
          <Link href="/admin/restaurant"><strong>Ресторан</strong><span>Контакты, часы работы, логотип и ссылки</span></Link>
          <Link href="/admin/delivery"><strong>Варианты доставки</strong><span>Интервалы, стоимость и особые дни</span></Link>
          <Link href="/admin/promos"><strong>Акции</strong><span>Тексты и изображения предложений</span></Link>
          <Link href="/admin/gallery"><strong>Галерея</strong><span>Фотографии ресторана</span></Link>
          <Link href="/admin/banquets"><strong>Банкеты</strong><span>Залы и описание услуги</span></Link>
          <Link href="/admin/pages"><strong>Страницы сайта</strong><span>Заголовки и тексты</span></Link>
          <Link href="/admin/sync"><strong>Синхронизация</strong><span>Яндекс.Еда и расписание обновлений</span></Link>
          <Link href="/admin/print-materials"><strong>Печатные материалы</strong><span>Визитки и магниты с QR-кодом</span></Link>
          <Link href="/admin/billing"><strong>Подписка</strong><span>Баланс, тариф и счета</span></Link>
          <Link href="/admin/team"><strong>Сотрудники</strong><span>Личные аккаунты и права доступа</span></Link>
        </div>
      </section>
    </div>
  );
}
