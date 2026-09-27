"use client";

import { useEffect, useRef, useState } from "react";
import restaurantSource from "../lib/restaurant-source.json";
import siteSettingsSource from "../lib/site-settings-source.json";
import themeSource from "../lib/theme-source.json";
import promosSource from "../lib/promos-source.json";
import pagesSource from "../lib/pages-source.json";

type Zone = { id: number; name: string; mode: "asap" | "scheduled"; price: number; freeFrom: number; hoursFrom: string; hoursTo: string; enabled: boolean };
type Hall = { id: number; name: string; capacity: string };
type GalleryPhoto = { id: string; url: string; alt: string; uploaded?: boolean };
type GuestChannel = "whatsapp" | "telegram";
type GuestChannels = Record<GuestChannel, boolean>;

const days = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const initialHours = days.map((day, index) => ({ day, open: true, from: "11:00", to: index < 5 ? "00:00" : "01:00" }));
const initialGallery: GalleryPhoto[] = Array.from({ length: 6 }, (_, index) => ({ id: `g${index + 1}`, url: `/gallery/g${index + 1}.webp`, alt: `Фото ресторана ${index + 1}` }));

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return <section className="panel settings-card demo-settings-card"><div className="settings-card-head"><div><h2>{title}</h2>{hint && <p>{hint}</p>}</div></div>{children}</section>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="demo-field"><span>{label}</span>{children}</label>;
}
function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (value: boolean) => void; children: React.ReactNode }) {
  return <label className="demo-toggle"><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)}/><span>{children}</span></label>;
}
function Save({ onClick, children = "Сохранить" }: { onClick: () => void; children?: React.ReactNode }) {
  return <button type="button" className="primary-button" onClick={onClick}>{children}</button>;
}

export default function SettingsSections({ notify, guestChannels, onGuestChannelChange }: { notify: (message: string) => void; guestChannels: GuestChannels; onGuestChannelChange: (channel: GuestChannel, visible: boolean) => void }) {
  const [restaurant, setRestaurant] = useState({ name: restaurantSource.name, phone: restaurantSource.phone, email: restaurantSource.email, address: restaurantSource.address, whatsapp: restaurantSource.socials.whatsapp, telegram: restaurantSource.socials.telegram });
  const [logo, setLogo] = useState("/logo.png");
  const [hours, setHours] = useState(initialHours);
  const [exceptions, setExceptions] = useState<{ id: number; date: string; open: boolean; from: string; to: string }[]>([]);
  const [siteTheme, setSiteTheme] = useState({ preset: themeSource.preset, accent: themeSource.accent, background: false, position: "center", dim: 20, dark: themeSource.dark });
  const [backgroundImage, setBackgroundImage] = useState("");
  const [delivery, setDelivery] = useState({ enabled: siteSettingsSource.delivery.enabled, pickup: siteSettingsSource.delivery.pickupEnabled, minOrder: siteSettingsSource.delivery.minOrder, timezone: "Europe/Moscow" });
  const [zones, setZones] = useState<Zone[]>([]);
  const [pricing, setPricing] = useState({ mode: siteSettingsSource.pricing.globalMode, percent: siteSettingsSource.pricing.globalPercent, payment: siteSettingsSource.payment.provider, cashback: siteSettingsSource.loyalty.cashbackPercent, maxSpend: siteSettingsSource.loyalty.maxSpendPercent });
  const [channels, setChannels] = useState({ telegram: false, telegramChat: "", email: false, emailAddress: siteSettingsSource.channels.email.address, whatsapp: true, whatsappPhone: siteSettingsSource.channels.whatsapp.phone });
  const [booking, setBooking] = useState({ ...siteSettingsSource.booking });
  const [promos, setPromos] = useState(promosSource.promos);
  const [newPromo, setNewPromo] = useState({ title: "", text: "" });
  const [gallery, setGallery] = useState<GalleryPhoto[]>(initialGallery);
  const [banquets, setBanquets] = useState({ enabled: false, title: "Банкеты", phone: "", description: "", conditions: "", prices: "", ctaText: "Оставить заявку", ctaUrl: "" });
  const [halls, setHalls] = useState<Hall[]>([]);
  const [hallForm, setHallForm] = useState({ name: "", capacity: "" });
  const [pages, setPages] = useState(pagesSource.pages);
  const [selectedPage, setSelectedPage] = useState(pagesSource.pages[0]?.slug ?? "");
  const [pagePreview, setPagePreview] = useState(false);
  const [sync, setSync] = useState({ ...siteSettingsSource.sync });
  const [syncState, setSyncState] = useState("Не запускалась");
  const [print, setPrint] = useState({ kind: "card", style: "accent", title: restaurantSource.name, subtitle: "Сканируйте, чтобы заказать снова", qrText: "Заказать", url: siteSettingsSource.domains.canonical, campaign: "repeat-order" });
  const galleryInput = useRef<HTMLInputElement>(null);
  const galleryUrls = useRef<string[]>([]);
  const logoInput = useRef<HTMLInputElement>(null);
  const backgroundInput = useRef<HTMLInputElement>(null);
  const selectedPageData = pages.find(page => page.slug === selectedPage);
  const saved = () => {
    window.localStorage.setItem("ochag-admin-settings", JSON.stringify({ restaurant, hours, exceptions, siteTheme, delivery, zones, pricing, channels, booking, promos, banquets, halls, pages, sync, print }));
    notify("Настройки сохранены");
  };

  useEffect(() => {
    const raw = window.localStorage.getItem("ochag-admin-settings");
    if (!raw) return;
    try {
      const draft = JSON.parse(raw) as Record<string, unknown>;
      if (draft.restaurant) setRestaurant(draft.restaurant as typeof restaurant);
      if (draft.hours) setHours(draft.hours as typeof hours);
      if (draft.exceptions) setExceptions(draft.exceptions as typeof exceptions);
      if (draft.siteTheme) setSiteTheme(draft.siteTheme as typeof siteTheme);
      if (draft.delivery) setDelivery(draft.delivery as typeof delivery);
      if (draft.zones) setZones(draft.zones as typeof zones);
      if (draft.pricing) setPricing(draft.pricing as typeof pricing);
      if (draft.channels) setChannels(draft.channels as typeof channels);
      if (draft.booking) setBooking(draft.booking as typeof booking);
      if (draft.promos) setPromos(draft.promos as typeof promos);
      if (draft.banquets) setBanquets(draft.banquets as typeof banquets);
      if (draft.halls) setHalls(draft.halls as typeof halls);
      if (draft.pages) setPages(draft.pages as typeof pages);
      if (draft.sync) setSync(draft.sync as typeof sync);
      if (draft.print) setPrint(draft.print as typeof print);
    } catch { window.localStorage.removeItem("ochag-admin-settings"); }
  }, []);

  useEffect(() => () => { if (logo.startsWith("blob:")) URL.revokeObjectURL(logo); }, [logo]);
  useEffect(() => () => { if (backgroundImage.startsWith("blob:")) URL.revokeObjectURL(backgroundImage); }, [backgroundImage]);
  useEffect(() => () => { galleryUrls.current.forEach(url => URL.revokeObjectURL(url)); }, []);

  return <>
    <Card title="Ресторан" hint="Контакты, логотип и часы работы">
      <div className="demo-form-grid"><Field label="Название"><input value={restaurant.name} onChange={e => setRestaurant({ ...restaurant, name: e.target.value })}/></Field><Field label="Телефон"><input value={restaurant.phone} onChange={e => setRestaurant({ ...restaurant, phone: e.target.value })}/></Field><Field label="Email"><input type="email" value={restaurant.email} onChange={e => setRestaurant({ ...restaurant, email: e.target.value })}/></Field><Field label="Адрес"><input value={restaurant.address} onChange={e => setRestaurant({ ...restaurant, address: e.target.value })}/></Field><Field label="WhatsApp на сайте"><input value={restaurant.whatsapp} onChange={e => setRestaurant({ ...restaurant, whatsapp: e.target.value })}/></Field><Field label="Telegram"><input value={restaurant.telegram} onChange={e => setRestaurant({ ...restaurant, telegram: e.target.value })}/></Field></div>
      <div className="logo-edit"><img src={logo} alt="Логотип ресторана"/><div><p>Логотип сайта</p><button className="outline-button" onClick={() => logoInput.current?.click()}>Заменить логотип</button><input ref={logoInput} className="sr-only" type="file" accept="image/*" onChange={e => { const file = e.target.files?.[0]; if (file) setLogo(URL.createObjectURL(file)); }}/></div></div>
      <h3 className="settings-subhead">Часы работы</h3><div className="hours-list">{hours.map((entry, index) => <div className="hours-row" key={entry.day}><strong>{entry.day}</strong><Toggle checked={entry.open} onChange={open => setHours(hours.map((day, i) => i === index ? { ...day, open } : day))}>{entry.open ? "Открыто" : "Выходной"}</Toggle><input aria-label={`С ${entry.day}`} type="time" disabled={!entry.open} value={entry.from} onChange={e => setHours(hours.map((day, i) => i === index ? { ...day, from: e.target.value } : day))}/><span>—</span><input aria-label={`До ${entry.day}`} type="time" disabled={!entry.open} value={entry.to} onChange={e => setHours(hours.map((day, i) => i === index ? { ...day, to: e.target.value } : day))}/></div>)}</div>
      <h3 className="settings-subhead">Особые дни</h3><div className="stacked-list">{exceptions.map(ex => <div className="settings-list-row" key={ex.id}><input aria-label="Дата исключения" type="date" value={ex.date} onChange={e => setExceptions(exceptions.map(item => item.id === ex.id ? { ...item, date: e.target.value } : item))}/><Toggle checked={ex.open} onChange={open => setExceptions(exceptions.map(item => item.id === ex.id ? { ...item, open } : item))}>{ex.open ? "Особые часы" : "Выходной"}</Toggle><input aria-label="Начало особых часов" type="time" value={ex.from} disabled={!ex.open} onChange={e => setExceptions(exceptions.map(item => item.id === ex.id ? { ...item, from: e.target.value } : item))}/><input aria-label="Конец особых часов" type="time" value={ex.to} disabled={!ex.open} onChange={e => setExceptions(exceptions.map(item => item.id === ex.id ? { ...item, to: e.target.value } : item))}/><button className="outline-button" onClick={() => setExceptions(exceptions.filter(item => item.id !== ex.id))}>Удалить</button></div>)}</div><button className="outline-button" onClick={() => setExceptions([...exceptions, { id: Date.now(), date: "", open: false, from: "11:00", to: "20:00" }])}>+ Особый день</button><div className="settings-actions"><Save onClick={saved}/></div>
    </Card>

    <Card title="Оформление сайта" hint="Эти параметры относятся к сайту ресторана. Переключатель темы панели работает отдельно.">
      <div className="demo-form-grid"><Field label="Пресет сайта"><select value={siteTheme.preset} onChange={e => setSiteTheme({ ...siteTheme, preset: e.target.value })}><option value="warm">Тёплый</option><option value="minimal">Минималистичный</option><option value="elegant">Элегантный</option></select></Field><Field label="Фирменный цвет"><input type="color" value={siteTheme.accent} onChange={e => setSiteTheme({ ...siteTheme, accent: e.target.value })}/></Field><Field label="Положение фона"><select value={siteTheme.position} onChange={e => setSiteTheme({ ...siteTheme, position: e.target.value })}><option value="center">По центру</option><option value="top">Сверху</option><option value="bottom">Снизу</option></select></Field><Field label={`Затемнение: ${siteTheme.dim}%`}><input type="range" min="0" max="80" value={siteTheme.dim} onChange={e => setSiteTheme({ ...siteTheme, dim: Number(e.target.value) })}/></Field></div>
      <div className="settings-toggle-list"><Toggle checked={siteTheme.background} onChange={background => setSiteTheme({ ...siteTheme, background })}>Показывать фоновое изображение</Toggle><Toggle checked={siteTheme.dark} onChange={dark => setSiteTheme({ ...siteTheme, dark })}>Тёмное оформление сайта</Toggle></div><input ref={backgroundInput} className="sr-only" type="file" accept="image/*" onChange={e => { const file = e.target.files?.[0]; if (file) setBackgroundImage(URL.createObjectURL(file)); }}/><button className="outline-button" onClick={() => backgroundInput.current?.click()}>Загрузить фон</button>{backgroundImage && <img className="background-preview" src={backgroundImage} alt="Предпросмотр фона"/>}<div className="settings-actions"><Save onClick={saved}/></div>
    </Card>

    <Card title="Доставка" hint="Общие условия и зоны доставки">
      <div className="settings-toggle-list"><Toggle checked={delivery.enabled} onChange={enabled => setDelivery({ ...delivery, enabled })}>Доставка включена</Toggle><Toggle checked={delivery.pickup} onChange={pickup => setDelivery({ ...delivery, pickup })}>Самовывоз включён</Toggle></div><div className="demo-form-grid"><Field label="Минимальная сумма заказа, ₽"><input type="number" min="0" value={delivery.minOrder} onChange={e => setDelivery({ ...delivery, minOrder: Number(e.target.value) })}/></Field><Field label="Часовой пояс"><select value={delivery.timezone} onChange={e => setDelivery({ ...delivery, timezone: e.target.value })}><option value="Europe/Moscow">Москва</option><option value="Europe/Kaliningrad">Калининград</option><option value="Europe/Samara">Самара</option><option value="Asia/Yekaterinburg">Екатеринбург</option><option value="Asia/Omsk">Омск</option><option value="Asia/Krasnoyarsk">Красноярск</option><option value="Asia/Irkutsk">Иркутск</option><option value="Asia/Yakutsk">Якутск</option><option value="Asia/Vladivostok">Владивосток</option><option value="Asia/Kamchatka">Камчатка</option></select></Field></div><h3 className="settings-subhead">Зоны доставки</h3>{zones.length === 0 && <p className="settings-help">Зоны доставки не добавлены.</p>}{zones.map(zone => <div className="zone-editor" key={zone.id}><div className="demo-form-grid"><Field label="Название зоны"><input value={zone.name} onChange={e => setZones(zones.map(item => item.id === zone.id ? { ...item, name: e.target.value } : item))}/></Field><Field label="Режим"><select value={zone.mode} onChange={e => setZones(zones.map(item => item.id === zone.id ? { ...item, mode: e.target.value as Zone["mode"] } : item))}><option value="asap">Как можно скорее</option><option value="scheduled">К выбранному времени</option></select></Field><Field label="Стоимость, ₽"><input type="number" min="0" value={zone.price} onChange={e => setZones(zones.map(item => item.id === zone.id ? { ...item, price: Number(e.target.value) } : item))}/></Field><Field label="Бесплатно от, ₽"><input type="number" min="0" value={zone.freeFrom} onChange={e => setZones(zones.map(item => item.id === zone.id ? { ...item, freeFrom: Number(e.target.value) } : item))}/></Field><Field label="Часы с"><input type="time" value={zone.hoursFrom} onChange={e => setZones(zones.map(item => item.id === zone.id ? { ...item, hoursFrom: e.target.value } : item))}/></Field><Field label="Часы до"><input type="time" value={zone.hoursTo} onChange={e => setZones(zones.map(item => item.id === zone.id ? { ...item, hoursTo: e.target.value } : item))}/></Field></div><div className="settings-actions"><Toggle checked={zone.enabled} onChange={enabled => setZones(zones.map(item => item.id === zone.id ? { ...item, enabled } : item))}>Зона активна</Toggle><button className="outline-button" onClick={() => setZones(zones.filter(item => item.id !== zone.id))}>Удалить зону</button></div></div>)}<button className="outline-button" onClick={() => setZones([...zones, { id: Date.now(), name: "Новая зона", mode: "asap", price: 0, freeFrom: 0, hoursFrom: "11:00", hoursTo: "23:00", enabled: true }])}>+ Добавить зону</button><div className="settings-actions"><Save onClick={saved}/></div>
    </Card>

    <Card title="Цены, оплата и лояльность" hint="Общие параметры оплаты и программы лояльности">
      <div className="demo-form-grid"><Field label="Режим цен меню"><select value={pricing.mode} onChange={e => setPricing({ ...pricing, mode: e.target.value })}><option value="yandex">Цена Яндекс.Еды</option><option value="manual">Ручные цены</option><option value="coefficient">Яндекс ± %</option></select></Field><Field label="Коэффициент, %"><input type="number" value={pricing.percent} onChange={e => setPricing({ ...pricing, percent: Number(e.target.value) })}/></Field><Field label="Онлайн-оплата"><select value={pricing.payment} onChange={e => setPricing({ ...pricing, payment: e.target.value })}><option value="none">Только при получении</option><option value="mock">Другой провайдер</option><option value="yookassa">ЮKassa</option></select></Field><Field label="Кэшбэк, %"><input type="number" min="0" max="100" value={pricing.cashback} onChange={e => setPricing({ ...pricing, cashback: Number(e.target.value) })}/></Field><Field label="Списание бонусов до, %"><input type="number" min="0" max="100" value={pricing.maxSpend} onChange={e => setPricing({ ...pricing, maxSpend: Number(e.target.value) })}/></Field></div><div className="settings-actions"><Save onClick={saved}/></div>
    </Card>

    <Card title="Связь с гостями" hint="Мессенджеры в заказах и бронях">
      <div className="settings-toggle-list">
        <Toggle checked={guestChannels.whatsapp} onChange={visible => onGuestChannelChange("whatsapp", visible)}>Показывать WhatsApp</Toggle>
        <Toggle checked={guestChannels.telegram} onChange={visible => onGuestChannelChange("telegram", visible)}>Показывать Telegram</Toggle>
      </div>
    </Card>

    <Card title="Каналы уведомлений" hint="Куда отправлять сообщения о заказах и бронированиях">
      <div className="settings-toggle-list"><Toggle checked={channels.telegram} onChange={telegram => setChannels({ ...channels, telegram })}>Telegram</Toggle><Toggle checked={channels.email} onChange={email => setChannels({ ...channels, email })}>Email</Toggle><Toggle checked={channels.whatsapp} onChange={whatsapp => setChannels({ ...channels, whatsapp })}>WhatsApp</Toggle></div><div className="demo-form-grid"><Field label="Chat ID Telegram"><input value={channels.telegramChat} onChange={e => setChannels({ ...channels, telegramChat: e.target.value })}/></Field><Field label="Email для заказов"><input type="email" value={channels.emailAddress} onChange={e => setChannels({ ...channels, emailAddress: e.target.value })}/></Field><Field label="WhatsApp для сайта"><input value={channels.whatsappPhone} onChange={e => setChannels({ ...channels, whatsappPhone: e.target.value })}/></Field></div><div className="settings-actions"><Save onClick={saved}/></div>
    </Card>

    <Card title="Параметры бронирования" hint="Условия создания брони на сайте">
      <Toggle checked={booking.enabled} onChange={enabled => setBooking({ ...booking, enabled })}>Бронирование включено</Toggle><div className="demo-form-grid"><Field label="Шаг слота, мин"><input type="number" min="5" value={booking.slotMinutes} onChange={e => setBooking({ ...booking, slotMinutes: Number(e.target.value) })}/></Field><Field label="Гостей на слот, макс"><input type="number" min="1" value={booking.maxGuestsPerSlot} onChange={e => setBooking({ ...booking, maxGuestsPerSlot: Number(e.target.value) })}/></Field><Field label="Не раньше, ч"><input type="number" min="0" value={booking.minHoursAhead} onChange={e => setBooking({ ...booking, minHoursAhead: Number(e.target.value) })}/></Field></div><div className="settings-actions"><Save onClick={saved}/></div>
    </Card>

    <Card title="Акции" hint="Тексты действующих предложений">
      <div className="stacked-list">{promos.map(promo => <div className="settings-list-row" key={promo.id}><div><strong>{promo.title}</strong><p>{promo.text}</p></div><button className="outline-button" onClick={() => setPromos(promos.filter(item => item.id !== promo.id))}>Удалить</button></div>)}</div><div className="demo-form-grid"><Field label="Заголовок акции"><input value={newPromo.title} onChange={e => setNewPromo({ ...newPromo, title: e.target.value })}/></Field><Field label="Текст акции"><textarea value={newPromo.text} onChange={e => setNewPromo({ ...newPromo, text: e.target.value })}/></Field></div><button className="outline-button" onClick={() => { if (!newPromo.title.trim()) { notify("Введите заголовок акции"); return; } setPromos([...promos, { id: `demo-${Date.now()}`, title: newPromo.title.trim(), text: newPromo.text, image: "", activeFrom: null, activeTo: null }]); setNewPromo({ title: "", text: "" }); notify("Акция добавлена"); }}>+ Добавить акцию</button>
    </Card>

    <Card title="Галерея" hint="Фото ресторана «Очаг Grill»">
      <div className="demo-gallery">{gallery.map(photo => <div key={photo.id}><img src={photo.url} alt={photo.alt}/><button aria-label={`Удалить ${photo.alt}`} onClick={() => { if (photo.uploaded) { URL.revokeObjectURL(photo.url); galleryUrls.current = galleryUrls.current.filter(url => url !== photo.url); } setGallery(gallery.filter(item => item.id !== photo.id)); }}>×</button></div>)}</div><input ref={galleryInput} className="sr-only" type="file" accept="image/*" onChange={e => { const file = e.target.files?.[0]; if (file) { const url = URL.createObjectURL(file); galleryUrls.current.push(url); setGallery([...gallery, { id: `local-${Date.now()}`, url, alt: file.name, uploaded: true }]); notify("Фото добавлено"); } }}/><button className="outline-button" onClick={() => galleryInput.current?.click()}>+ Добавить фото</button>
    </Card>

    <Card title="Банкеты" hint="Описание раздела и залы">
      <Toggle checked={banquets.enabled} onChange={enabled => setBanquets({ ...banquets, enabled })}>Раздел «Банкеты» включён</Toggle><div className="demo-form-grid"><Field label="Заголовок"><input value={banquets.title} onChange={e => setBanquets({ ...banquets, title: e.target.value })}/></Field><Field label="Телефон менеджера"><input value={banquets.phone} onChange={e => setBanquets({ ...banquets, phone: e.target.value })}/></Field><Field label="Описание"><textarea value={banquets.description} onChange={e => setBanquets({ ...banquets, description: e.target.value })}/></Field><Field label="Условия"><textarea value={banquets.conditions} onChange={e => setBanquets({ ...banquets, conditions: e.target.value })}/></Field><Field label="Цены"><textarea value={banquets.prices} onChange={e => setBanquets({ ...banquets, prices: e.target.value })}/></Field><Field label="Текст кнопки"><input value={banquets.ctaText} onChange={e => setBanquets({ ...banquets, ctaText: e.target.value })}/></Field><Field label="Ссылка кнопки"><input value={banquets.ctaUrl} onChange={e => setBanquets({ ...banquets, ctaUrl: e.target.value })}/></Field></div><h3 className="settings-subhead">Залы</h3>{halls.map(hall => <div className="settings-list-row" key={hall.id}><div><strong>{hall.name}</strong><p>{hall.capacity}</p></div><button className="outline-button" onClick={() => setHalls(halls.filter(item => item.id !== hall.id))}>Удалить</button></div>)}<div className="demo-form-grid"><Field label="Название зала"><input value={hallForm.name} onChange={e => setHallForm({ ...hallForm, name: e.target.value })}/></Field><Field label="Вместимость"><input value={hallForm.capacity} onChange={e => setHallForm({ ...hallForm, capacity: e.target.value })}/></Field></div><button className="outline-button" onClick={() => { if (!hallForm.name.trim()) { notify("Введите название зала"); return; } setHalls([...halls, { id: Date.now(), ...hallForm }]); setHallForm({ name: "", capacity: "" }); }}>+ Добавить зал</button><div className="settings-actions"><Save onClick={saved}/></div>
    </Card>

    <Card title="Страницы сайта" hint="Тексты страниц ресторана">
      <div className="page-picker">{pages.map(page => <button className={selectedPage === page.slug ? "active" : ""} key={page.slug} onClick={() => { setSelectedPage(page.slug); setPagePreview(false); }}>{page.title}</button>)}</div>{selectedPageData && <><div className="demo-form-grid"><Field label="Заголовок"><input value={selectedPageData.title} onChange={e => setPages(pages.map(page => page.slug === selectedPage ? { ...page, title: e.target.value } : page))}/></Field><Field label="Текст"><textarea rows={7} value={selectedPageData.body} onChange={e => setPages(pages.map(page => page.slug === selectedPage ? { ...page, body: e.target.value } : page))}/></Field></div><div className="settings-actions"><Save onClick={saved}/><button className="outline-button" onClick={() => setPagePreview(!pagePreview)}>{pagePreview ? "Скрыть предпросмотр" : "Предпросмотр"}</button></div>{pagePreview && <div className="page-preview"><h3>{selectedPageData.title}</h3><p>{selectedPageData.body}</p></div>}</>}
    </Card>

    <Card title="Синхронизация" hint="Локальный образец настроек Яндекс.Еды">
      <Toggle checked={sync.enabled} onChange={enabled => setSync({ ...sync, enabled })}>Автоматическая синхронизация</Toggle><div className="demo-form-grid"><Field label="Идентификатор ресторана в Яндекс.Еде"><input value={sync.placeSlug} onChange={e => setSync({ ...sync, placeSlug: e.target.value })}/></Field><Field label="Периодичность, мин"><input type="number" min="5" max="1440" value={sync.intervalMinutes} onChange={e => setSync({ ...sync, intervalMinutes: Number(e.target.value) })}/></Field></div><div className="settings-actions"><Save onClick={saved}/><button className="outline-button" onClick={() => { setSyncState("Не запускалась"); notify("Синхронизация недоступна в локальном прототипе"); }}>Синхронизировать сейчас</button></div><p className="settings-help">Состояние: {syncState}. Переключатель и сохранение действуют только в этом браузере; обмен с Яндекс.Едой не запускается.</p>
    </Card>

    <Card title="Печатные материалы" hint="Визитка и магнит с QR-ссылкой">
      <div className="page-picker"><button className={print.kind === "card" ? "active" : ""} onClick={() => setPrint({ ...print, kind: "card" })}>Визитка · 90 × 50 мм</button><button className={print.kind === "magnet" ? "active" : ""} onClick={() => setPrint({ ...print, kind: "magnet" })}>Магнит · 70 × 70 мм</button></div><div className="demo-form-grid"><Field label="Стиль"><select value={print.style} onChange={e => setPrint({ ...print, style: e.target.value })}><option value="accent">Акцентный</option><option value="minimal">Минималистичный</option><option value="contrast">Контрастный</option></select></Field><Field label="Заголовок"><input value={print.title} onChange={e => setPrint({ ...print, title: e.target.value })}/></Field><Field label="Пояснение"><input value={print.subtitle} onChange={e => setPrint({ ...print, subtitle: e.target.value })}/></Field><Field label="Фраза рядом с QR"><input value={print.qrText} onChange={e => setPrint({ ...print, qrText: e.target.value })}/></Field><Field label="Адрес сайта"><input type="url" value={print.url} onChange={e => setPrint({ ...print, url: e.target.value })}/></Field><Field label="Название кампании"><input value={print.campaign} onChange={e => setPrint({ ...print, campaign: e.target.value })}/></Field></div><div className="print-preview"><div><small>{print.kind === "card" ? "Визитка" : "Магнит"} · {print.style}</small><strong>{print.title}</strong><span>{print.subtitle}</span></div><div className="qr-placeholder">QR-код</div></div><div className="settings-actions"><Save onClick={saved}/><button className="outline-button" onClick={() => notify("Не удалось экспортировать макет")}>Экспортировать</button></div>
    </Card>

    <Card title="Подписка" hint="Баланс, тариф, счета и активность платформы">
      <div className="billing-preview"><div><span>Баланс</span><strong>—</strong></div><div><span>Тариф</span><strong>Не подключён</strong></div><div><span>Счета</span><strong>Нет данных</strong></div><div><span>Активность</span><strong>Нет данных</strong></div></div><button className="outline-button" onClick={() => notify("Не удалось открыть оплату")}>Пополнить баланс</button>
    </Card>
  </>;
}

