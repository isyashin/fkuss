"use client";

import { useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from "react";
import { saveAllAdminSettings, saveBackground, saveGuestContactChannels, saveSettings, saveTheme } from "./actions";
import { contentAssetUrl } from "@/lib/assets";
import type { ContentSettings } from "@/lib/content-schema";
import type { ThemeConfig } from "@/lib/content";
import styles from "./settings-admin.module.css";
import type { PublicAdminSound } from "@/lib/admin-sound";
import { SoundSettings } from "./sound-settings";
import { visibleGuestChannels, type GuestChannels } from "@/lib/guest-contact";
import { AdminIcon } from "../admin-icon";

const PRESETS = [
  { id: "warm", name: "Тёплый (трактир)" },
  { id: "minimal", name: "Минимальный" },
  { id: "elegant", name: "Тёмный (fine dining)" },
];

function subscribeTheme(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("restaurant-admin-theme-change", callback);
  return () => { window.removeEventListener("storage", callback); window.removeEventListener("restaurant-admin-theme-change", callback); };
}

type SaveFeedback = { section: string; text: string; error: boolean };

function SaveButton({ section, onSave, pending, feedback }: { section: string; onSave: () => void; pending: boolean; feedback: SaveFeedback }) {
  return <div className={styles.sectionActions}><button type="button" className={styles.saveButton} disabled={pending} onClick={onSave}>{pending && feedback.section === section ? "Сохраняю…" : "Сохранить"}</button>{feedback.section === section && feedback.text && <span role={feedback.error ? "alert" : "status"} className={feedback.error ? styles.error : styles.saved}>{feedback.text}</span>}</div>;
}

export function SettingsAdmin({ settings, theme, sound, actor, restaurantSection, otherSections }: { settings: ContentSettings; theme: ThemeConfig; sound: PublicAdminSound; actor: { name: string; role: string }; restaurantSection: ReactNode; otherSections: ReactNode }) {
  const [s, setS] = useState({ ...settings, guestContact: visibleGuestChannels(settings) });
  const savedSettings = useRef(settings);
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
  const savedTheme = useRef({ preset: theme.preset, accent: theme.accent });
  const savedBackground = useRef(bg);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState({ section: "", text: "", error: false });
  const dark = useSyncExternalStore(subscribeTheme, () => localStorage.getItem("restaurant-admin-theme") === "dark", () => false);

  const inputCls = "mt-1 w-full min-h-11 px-3 rounded-[var(--radius)] bg-card border border-foreground/15";

  function setDark(next: boolean) {
    localStorage.setItem("restaurant-admin-theme", next ? "dark" : "light");
    window.dispatchEvent(new Event("restaurant-admin-theme-change"));
  }

  function saveSection(section: string, action: () => Promise<void>) {
    startTransition(async () => {
      setFeedback({ section, text: "", error: false });
      try {
        await action();
        setFeedback({ section, text: "Сохранено", error: false });
      } catch (cause) {
        setFeedback({ section, text: cause instanceof Error ? cause.message : "Не удалось сохранить настройки", error: true });
      }
    });
  }

  function saveContent(section: "delivery" | "channels" | "booking") {
    saveSection(section, async () => {
      const next: ContentSettings = { ...savedSettings.current, [section]: s[section], ...(section === "delivery" ? { timezone: s.timezone } : {}) };
      await saveSettings(next);
      savedSettings.current = next;
    });
  }

  function savePricePaymentLoyalty() {
    saveSection("pricing", async () => {
      const pricing = { globalMode: pricingMode, globalPercent: pricingPercent };
      const next: ContentSettings = { ...savedSettings.current, pricing, payment: s.payment, loyalty: s.loyalty };
      await saveAllAdminSettings({ settings: next, pricing, theme: savedTheme.current, background: savedBackground.current });
      savedSettings.current = next;
    });
  }

  async function changeGuestContact(channel: keyof GuestChannels, enabled: boolean) {
    const previous = s.guestContact;
    const next = { ...previous, [channel]: enabled };
    setContactSaving(true);
    setContactError("");
    setS((current) => ({ ...current, guestContact: next }));
    try { await saveGuestContactChannels(next); savedSettings.current = { ...savedSettings.current, guestContact: next }; }
    catch (cause) {
      setS((current) => ({ ...current, guestContact: previous }));
      setContactError(cause instanceof Error ? cause.message : "Не удалось сохранить каналы связи");
    } finally { setContactSaving(false); }
  }

  return (
    <div className={styles.page}>
      <section className={styles.card} aria-label="Внешний вид панели">
        <h2>Внешний вид</h2>
        <p className={styles.cardHint}>Только для панели: тема сайта ресторана не меняется</p>
        <div className={styles.themeChoices} role="group" aria-label="Тема панели">
          <button type="button" aria-pressed={!dark} className={!dark ? styles.activeTheme : ""} onClick={() => setDark(false)}><AdminIcon name="sun"/> Светлая {!dark && <span aria-hidden="true">✓</span>}</button>
          <button type="button" aria-pressed={dark} className={dark ? styles.activeTheme : ""} onClick={() => setDark(true)}><AdminIcon name="moon"/> Тёмная {dark && <span aria-hidden="true">✓</span>}</button>
        </div>
        <button type="button" className={styles.outlineButton} onClick={() => window.dispatchEvent(new Event("restaurant-admin-sidebar-toggle"))}>Свернуть / развернуть боковую панель</button>
      </section>
      <SoundSettings initial={sound}/>
      <section className={styles.card} aria-label="Профиль администратора">
        <h2>Администратор</h2>
        <p className={styles.cardHint}>Профиль администратора ресторана.</p>
        <div className={styles.adminCard}><span>{actor.name.trim().slice(0, 1).toLocaleUpperCase("ru-RU") || "А"}</span><div><strong>{actor.name}</strong><small>{actor.role === "owner" ? "Владелец ресторана" : "Сотрудник ресторана"}</small></div></div>
      </section>
      {restaurantSection}
      <section className={styles.card} id="site-theme">
        <h2>Оформление сайта</h2>
        <p className={styles.cardHint}>Эти параметры относятся к сайту ресторана. Переключатель темы панели работает отдельно.</p>
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
        <h3 className={styles.subhead}>Фоновое изображение</h3>
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
        <SaveButton section="site-theme" pending={pending} feedback={feedback} onSave={() => saveSection("site-theme", async () => { await saveTheme({ preset, accent }); savedTheme.current = { preset, accent }; await saveBackground(bg); savedBackground.current = bg; })}/>
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
        <SaveButton section="delivery" pending={pending} feedback={feedback} onSave={() => saveContent("delivery")}/>
      </section>

      <section className={styles.card} id="pricing">
        <h2>Цены, оплата и лояльность</h2>
        <p className={styles.cardHint}>Общие параметры оплаты и программы лояльности</p>
        <h3 className={styles.subhead}>Ценообразование (общее)</h3>
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
        <h3 className={styles.subhead}>Оплата</h3>
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
        <h3 className={styles.subhead}>Лояльность</h3>
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
        <SaveButton section="pricing" pending={pending} feedback={feedback} onSave={savePricePaymentLoyalty}/>
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
        <SaveButton section="channels" pending={pending} feedback={feedback} onSave={() => saveContent("channels")}/>
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
        <SaveButton section="booking" pending={pending} feedback={feedback} onSave={() => saveContent("booking")}/>
      </section>

      {otherSections}
    </div>
  );
}
