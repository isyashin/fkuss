"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import menuSource from "../lib/menu.json";
import contact from "../lib/contact.json";
import { normalizePhoneNumber } from "../lib/contact-links.mjs";
import { calculatePreviewTotal } from "../lib/preview-total.mjs";
import { changeOrderStatus, orderStatusesFor } from "../lib/order-status.mjs";
import SettingsSections from "./settings-sections";
import { MenuPanel, OrderDishPicker, type Dish } from "./menu-panel";

type Section = "orders" | "bookings" | "menu" | "settings";
type Status = "Новый" | "Принят" | "Готовится" | "Готов" | "Передан курьеру" | "Доставлен" | "Выдан" | "Отменён";
type Line = { id: string; quantity: number };
type Order = { id: number; time: string; type: "Доставка" | "Самовывоз"; guest: string; status: Status; lines: Line[]; note: string; address: string; preferredChannel: GuestChannel };
type Booking = { id: number; time: string; guests: number; guest: string; status: "Новая" | "Подтверждена"; note: string };
type GuestChannel = "whatsapp" | "telegram";
type GuestChannels = Record<GuestChannel, boolean>;
const defaultGuestChannels: GuestChannels = { whatsapp: true, telegram: true };
const guestChannelOrder: GuestChannel[] = ["whatsapp", "telegram"];
const guestChannelsKey = "ochag-admin-guest-channels";

const initialOrders: Order[] = [
  { id: 1047, time: "12:24", type: "Доставка", guest: "Анна", status: "Новый", lines: [{ id: "dish-460470793", quantity: 1 }, { id: "dish-424028201", quantity: 1 }, { id: "dish-460476403", quantity: 1 }], note: "Без лука, пожалуйста", address: "ул. Лесная, 12, кв. 8", preferredChannel: "whatsapp" },
  { id: 1046, time: "12:17", type: "Самовывоз", guest: "Илья", status: "Принят", lines: [{ id: "dish-429867259", quantity: 2 }, { id: "dish-460476403", quantity: 1 }], note: "", address: "Самовывоз из ресторана", preferredChannel: "telegram" },
  { id: 1045, time: "11:50", type: "Доставка", guest: "Мария", status: "Готов", lines: [{ id: "dish-2056135322", quantity: 1 }, { id: "dish-460474898", quantity: 1 }], note: "", address: "просп. Мира, 5", preferredChannel: "telegram" },
  { id: 1044, time: "11:35", type: "Самовывоз", guest: "Дмитрий", status: "Выдан", lines: [{ id: "dish-460475823", quantity: 1 }, { id: "dish-429867304", quantity: 1 }], note: "", address: "Самовывоз из ресторана", preferredChannel: "whatsapp" },
  { id: 1043, time: "11:20", type: "Доставка", guest: "Елена", status: "Новый", lines: [{ id: "dish-429867304", quantity: 2 }], note: "", address: "ул. Садовая, 7", preferredChannel: "telegram" },
];
const initialBookings: Booking[] = [
  { id: 1, time: "Сегодня, 13:00", guests: 2, guest: "Сергей", status: "Новая", note: "Стол у окна" },
  { id: 2, time: "Сегодня, 15:30", guests: 4, guest: "Ольга", status: "Новая", note: "" },
  { id: 3, time: "Сегодня, 19:00", guests: 3, guest: "Павел", status: "Подтверждена", note: "" },
  { id: 4, time: "Завтра, 20:00", guests: 2, guest: "Наталья", status: "Подтверждена", note: "" },
];
const nav: { id: Section; title: string; icon: string }[] = [
  { id: "orders", title: "Заказы", icon: "orders" }, { id: "bookings", title: "Брони", icon: "calendar" },
  { id: "menu", title: "Меню", icon: "menu" }, { id: "settings", title: "Настройки", icon: "settings" },
];
const statuses: Status[] = ["Новый", "Принят", "Готовится", "Готов", "Передан курьеру", "Доставлен", "Выдан", "Отменён"];
const statusTone = (status: Status) => status === "Новый" ? "new" : status === "Готов" ? "ready" : status === "Отменён" ? "cancelled" : status === "Доставлен" || status === "Выдан" ? "done" : "working";
const rub = (n: number) => `${new Intl.NumberFormat("ru-RU").format(n)} ₽`;

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true as const };
  const paths: Record<string, React.ReactNode> = {
    orders: <><circle cx="10.5" cy="4" r="1.5"/><rect x="1.5" y="9" width="4" height="4" rx=".5"/><path d="M5.5 11h2l1.2-3c.4-.9 1.7-1.1 2.4-.4l2.6 2.5 2.4.5m-7.4 1.2 3.5 1.5 1.2 3.2M3.5 16.5h12.2l1.5-5h1.7m-1.4 1 1.5 4"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/></>,
    calendar: <><circle cx="5" cy="5" r="1.5"/><circle cx="19" cy="5" r="1.5"/><path d="M5 8v5l3 2h2m9-7v5l-3 2h-2M3 11v6h5v3m13-9v6h-5v3M9.5 12h5M12 12v8"/></>,
    menu: <><path d="M4 3v7a3 3 0 0 0 6 0V3M7 3v18M17 21V3c-3 2-4 5-4 10h4"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 1.1 1.9-2.1 2.1-1.9-1.1a8 8 0 0 1-2 .8l-.6 2.2h-3l-.6-2.2a8 8 0 0 1-2-.8l-1.9 1.1-2.1-2.1L5.4 15a8 8 0 0 1-.8-2L2.4 12l2.2-1a8 8 0 0 1 .8-2L4.3 7.1 6.4 5l1.9 1.1a8 8 0 0 1 2-.8L10.9 3h3l.6 2.3a8 8 0 0 1 2 .8L18.4 5l2.1 2.1L19.4 9a8 8 0 0 1 .8 2l2.2 1-2.2 1a8 8 0 0 1-.8 2Z"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>, collapse: <path d="m15 6-6 6 6 6"/>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
    moon: <path d="M20 15.5A8 8 0 0 1 8.5 4 8 8 0 1 0 20 15.5Z"/>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9ZM10 21h4"/></>,
    plus: <path d="M12 5v14M5 12h14"/>, minus: <path d="M5 12h14"/>, close: <path d="M5 5l14 14M19 5 5 19"/>,
    sound: <><path d="M11 5 6 9H3v6h3l5 4V5Zm4 3a5 5 0 0 1 0 8m3-11a9 9 0 0 1 0 14"/></>,
    play: <path d="m8 5 11 7-11 7V5Z"/>, upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 16v4h16v-4"/></>, trash: <><path d="M4 7h16M10 4h4m-8 3 1 13h10l1-13M10 11v6m4-6v6"/></>,
    search: <><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></>, check: <path d="m5 12 4 4L19 6"/>,
    more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  };
  return <svg {...common}>{paths[name] || paths.more}</svg>;
}

function SoundSettings({ sound, setSound, customName, onUpload, onRemove, onTest }: { sound: number; setSound: (n: number) => void; customName: string; onUpload: (file: File) => void; onRemove: () => void; onTest: (n?: number) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  return <div className="sound-settings">
    <div className="section-heading"><div><h3>Звук уведомления</h3><p>Для новых заказов и бронирований</p></div><Icon name="sound" size={20}/></div>
    {[1, 2].map(n => <div className="sound-row" key={n}>
      <label><input type="radio" name="sound" checked={sound === n} onChange={() => setSound(n)}/> Звук {n}</label>
      <button className="icon-button small" aria-label={`Прослушать звук ${n}`} onClick={() => onTest(n)}><Icon name="play" size={16}/></button>
    </div>)}
    {customName && <div className="sound-row custom-sound-row"><label><input type="radio" name="sound" checked={sound === 4} onChange={() => setSound(4)}/><span title={customName}>{customName}</span></label><button className="icon-button small" aria-label="Прослушать свой файл" onClick={() => onTest(4)}><Icon name="play" size={16}/></button><button className="icon-button small" aria-label="Удалить свой звуковой файл" title="Удалить файл" onClick={() => { onRemove(); if (fileRef.current) fileRef.current.value = ""; }}><Icon name="trash" size={17}/></button></div>}
    <input ref={fileRef} className="sr-only" type="file" accept="audio/*" onChange={e => { const file = e.target.files?.[0]; if (file) onUpload(file); }}/>
    <button className="outline-button full" onClick={() => fileRef.current?.click()}><Icon name="upload" size={17}/> Загрузить свой файл</button>
    <button className="subtle-button full" onClick={() => onTest()}>Проверить звук</button>
  </div>;
}

function ChannelIcon({ channel }: { channel: GuestChannel }) {
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {channel === "whatsapp" && <><path d="M12 3a9 9 0 0 0-7.7 13.7L3 21l4.4-1.3A9 9 0 1 0 12 3Z"/><path d="M8.2 8.4c.2-.3.5-.3.8 0l1.2 1.5-.7 1c.7 1.4 1.7 2.4 3.1 3.1l1-.7 1.5 1.2c.3.2.3.6 0 .8-.7.6-1.5.8-2.3.6a7.5 7.5 0 0 1-5.1-5.1c-.2-.8 0-1.7.5-2.4Z"/></>}
    {channel === "telegram" && <><path d="m3 11 18-8-5.8 18-3.4-7.2L3 11Z"/><path d="m11.8 13.8 5-5.1"/></>}
  </svg>;
}

function GuestContactActions({ phone, channels, preferredChannel, iconOnly = false }: { phone: string; channels: GuestChannels; preferredChannel?: GuestChannel; iconOnly?: boolean }) {
  const digits = normalizePhoneNumber(phone);
  const available = guestChannelOrder.filter(channel => channels[channel] && digits);
  const shown = preferredChannel ? (available.includes(preferredChannel) ? [preferredChannel] : []) : available;

  return <div className={`contact-actions ${iconOnly ? "compact" : ""}`}>
    <strong>{phone}</strong>
    <div className="contact-links">
      {shown.map(channel => {
        const label = channel === "whatsapp" ? "Открыть WhatsApp" : "Найти в Telegram";
        const href = channel === "whatsapp" ? `https://wa.me/${digits}` : `https://t.me/+${digits}`;
        const hint = channel === "telegram" ? `${label}. Поиск зависит от настроек приватности гостя` : label;
        return <a key={channel} className={`text-link ${iconOnly ? `contact-channel-icon ${channel}` : ""}`} href={href} target="_blank" rel="noopener noreferrer" aria-label={iconOnly ? hint : undefined} title={hint}>{iconOnly ? <ChannelIcon channel={channel}/> : label}</a>;
      })}
    </div>
    {preferredChannel && !shown.length && !iconOnly && <small>Выбранный канал скрыт в настройках</small>}
  </div>;
}

export default function Page() {
  const [dark, setDark] = useState(false);
  const [guestChannels, setGuestChannels] = useState<GuestChannels>(defaultGuestChannels);
  const [collapsed, setCollapsed] = useState(false);
  const [section, setSection] = useState<Section>("orders");
  const [filter, setFilter] = useState<Status | "Все">("Все");
  const [orders, setOrders] = useState(initialOrders);
  const [selectedOrderId, setSelectedOrderId] = useState(1047);
  const [bookings, setBookings] = useState(initialBookings);
  const [selectedBookingId, setSelectedBookingId] = useState(1);
  const [dishes, setDishes] = useState<Dish[]>(menuSource as Dish[]);
  const [addOpen, setAddOpen] = useState(false);
  const [sound, setSound] = useState(1);
  const [customName, setCustomName] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [detailsTab, setDetailsTab] = useState<"items" | "info">("items");
  const [sortNewest, setSortNewest] = useState(true);
  const prices = useMemo(() => Object.fromEntries(dishes.map(d => [d.id, d.price])), [dishes]);
  const currentOrder = orders.find(o => o.id === selectedOrderId) || orders[0];
  const currentBooking = bookings.find(b => b.id === selectedBookingId) || bookings[0];
  const newBookingCount = bookings.filter(b => b.status === "Новая").length;
  const bookingNavLabel = newBookingCount ? `Брони, новых: ${newBookingCount}` : "Брони";
  const shownOrders = orders.filter(o => filter === "Все" || o.status === filter).sort((a, b) => sortNewest ? b.id - a.id : a.id - b.id);
  const total = (order: Order) => calculatePreviewTotal(order.lines, prices);
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 3400); };

  useEffect(() => { const saved = window.localStorage.getItem("ochag-prototype-theme"); setDark(saved === "dark"); }, []);
  useEffect(() => { window.localStorage.setItem("ochag-prototype-theme", dark ? "dark" : "light"); }, [dark]);
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(guestChannelsKey) || "null") as Partial<GuestChannels> | null;
      if (saved) setGuestChannels({
        whatsapp: typeof saved.whatsapp === "boolean" ? saved.whatsapp : true,
        telegram: typeof saved.telegram === "boolean" ? saved.telegram : true,
      });
    } catch { window.localStorage.removeItem(guestChannelsKey); }
  }, []);
  const changeGuestChannel = (channel: GuestChannel, visible: boolean) => {
    const next = { ...guestChannels, [channel]: visible };
    setGuestChannels(next);
    window.localStorage.setItem(guestChannelsKey, JSON.stringify(next));
  };
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);

  const changeQuantity = (id: string, delta: number) => setOrders(prev => prev.map(o => o.id !== selectedOrderId ? o : { ...o, lines: o.lines.map(line => line.id === id ? { ...line, quantity: Math.max(1, line.quantity + delta) } : line) }));
  const removeDish = (id: string) => setOrders(prev => prev.map(o => o.id !== selectedOrderId ? o : { ...o, lines: o.lines.filter(line => line.id !== id) }));
  const addDish = (id: string) => { setOrders(prev => prev.map(o => o.id !== selectedOrderId ? o : { ...o, lines: o.lines.some(line => line.id === id) ? o.lines.map(line => line.id === id ? { ...line, quantity: line.quantity + 1 } : line) : [...o.lines, { id, quantity: 1 }] })); setAddOpen(false); notify("Блюдо добавлено в заказ"); };
  const setStatus = (status: Status) => { setOrders(prev => changeOrderStatus(prev, selectedOrderId, status)); notify(`Заказ № ${selectedOrderId}: статус «${status}»`); };
  const playSound = (choice = sound) => {
    if (choice === 4) { if (audioUrl) new Audio(audioUrl).play().catch(() => notify("Браузер не смог воспроизвести файл")); else notify("Сначала загрузите аудиофайл"); return; }
    const Context = window.AudioContext; const ctx = new Context(); const tones = choice === 2 ? [523, 659, 784] : [660, 880];
    tones.forEach((frequency, index) => { const oscillator = ctx.createOscillator(); const gain = ctx.createGain(); const start = ctx.currentTime + index * 0.17; oscillator.type = "sine"; oscillator.frequency.value = frequency; gain.gain.setValueAtTime(0.0001, start); gain.gain.exponentialRampToValueAtTime(0.11, start + 0.02); gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.15); oscillator.connect(gain).connect(ctx.destination); oscillator.start(start); oscillator.stop(start + 0.16); });
    window.setTimeout(() => ctx.close(), 1000);
  };
  const uploadAudio = (name: string, file: File) => { if (audioUrl) URL.revokeObjectURL(audioUrl); setAudioUrl(URL.createObjectURL(file)); setCustomName(name); setSound(4); notify("Аудиофайл загружен"); };
  const removeAudio = () => { setAudioUrl(null); setCustomName(""); setSound(1); notify("Звуковой файл удалён"); };

  return <div className={`app-shell ${dark ? "dark" : "light"} ${collapsed ? "collapsed" : ""}`}>
    <aside className="sidebar">
      <div className="brand-block"><div className="brand-logo"><img src="/logo.png" alt="Логотип Очаг Гриль"/></div>{!collapsed && <div className="brand-title"><strong>Очаг Grill</strong><span>Панель ресторана</span></div>}</div>
      <button className="collapse-button icon-button" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}><Icon name={collapsed ? "chevron" : "collapse"}/></button>
      <nav aria-label="Главная навигация">{nav.map(item => <button key={item.id} aria-label={item.id === "bookings" ? bookingNavLabel : item.title} title={collapsed ? (item.id === "bookings" ? bookingNavLabel : item.title) : undefined} className={`nav-button ${section === item.id ? "active" : ""}`} onClick={() => setSection(item.id)}><Icon name={item.icon} size={22}/><span>{item.title}</span>{item.id === "orders" && orders.filter(o => o.status === "Новый").length > 0 && <em>{orders.filter(o => o.status === "Новый").length}</em>}{item.id === "bookings" && newBookingCount > 0 && <em aria-hidden="true">{newBookingCount}</em>}</button>)}</nav>
      {!collapsed && <div className="sidebar-foot"><span className="sprig">✳</span><div>Хорошего дня!<small>Вкусная еда собирает людей</small></div></div>}
    </aside>

    <div className="workspace">
      <header className="topbar"><div className="breadcrumb">Панель администратора <span>/</span> <strong>{nav.find(n => n.id === section)?.title}</strong></div><div className="top-actions"><button className="icon-button notification" aria-label="Уведомления" onClick={() => { setSection("orders"); setFilter("Новый"); notify(`Новых заказов: ${orders.filter(o => o.status === "Новый").length}`); }}><Icon name="bell"/><i>{orders.filter(o => o.status === "Новый").length}</i></button><button type="button" className={`theme-toggle ${dark ? "is-dark" : ""}`} aria-label={dark ? "Включить светлую тему" : "Включить тёмную тему"} aria-pressed={dark} onClick={() => setDark(!dark)}><span className="theme-toggle-thumb"><Icon name={dark ? "moon" : "sun"} size={19}/></span><span className="theme-toggle-label">{dark ? "Тёмная" : "Светлая"}</span></button><div className="profile-wrap"><button className="profile-button" onClick={() => setProfileOpen(!profileOpen)} aria-expanded={profileOpen}><span className="avatar">АД</span><span className="profile-text"><b>Администратор</b><small>Профиль</small></span><Icon name="chevron" size={16}/></button>{profileOpen && <div className="profile-popover"><strong>Профиль</strong><p>Управление профилем администратора</p><button className="subtle-button" onClick={() => { setProfileOpen(false); notify("Профиль администратора"); }}>Понятно</button></div>}</div></div></header>

      {section === "orders" && <div className="orders-layout">
        <section className="panel orders-panel"><div className="panel-head"><div><span className="eyebrow">Управление</span><h1>Заказы</h1></div><button className="sort-button" onClick={() => setSortNewest(!sortNewest)}>По времени · {sortNewest ? "сначала новые" : "сначала старые"} <span>⌄</span></button></div>
          <div className="filters" role="group" aria-label="Фильтр заказов">{(["Все", ...statuses] as const).map(s => <button key={s} className={filter === s ? "active" : ""} onClick={() => setFilter(s)}>{s}<span>{s === "Все" ? orders.length : orders.filter(o => o.status === s).length}</span></button>)}</div>
          <div className="order-list">{shownOrders.length ? shownOrders.map(order => <div key={order.id} className={`order-card ${order.type === "Доставка" ? "delivery" : "pickup"} ${selectedOrderId === order.id ? "selected" : ""}`}><button type="button" className="order-card-open" aria-label={`Открыть заказ № ${order.id}`} onClick={() => { setSelectedOrderId(order.id); setDetailsTab("items"); }}/><div className="order-lead"><span className={`type-badge ${order.type === "Доставка" ? "delivery" : "pickup"}`}>{order.type}</span><div className="order-meta"><strong>№ {order.id}</strong><small>{order.time}</small></div></div><div className="order-guest"><b>{order.guest}</b><span className="order-address">{order.type === "Доставка" ? order.address : "Самовывоз"}</span><GuestContactActions phone={contact.whatsappDisplay} channels={guestChannels} preferredChannel={order.preferredChannel} iconOnly/></div><div className="order-summary"><strong className="order-price">{rub(total(order))}</strong><span className={`status-badge ${statusTone(order.status)}`}>{order.status}</span></div><Icon name="chevron" size={17}/></div>) : <div className="empty-state">В этом фильтре заказов нет</div>}</div>
        </section>
        <section className="panel detail-panel"><div className="detail-head"><div><span className="eyebrow">Детали заказа</span><div className="title-line"><h2>Заказ № {currentOrder.id}</h2><span className={`status-badge ${statusTone(currentOrder.status)}`}>{currentOrder.status}</span></div><p>Сегодня, {currentOrder.time}</p></div></div><div className="tabs"><button className={detailsTab === "items" ? "active" : ""} onClick={() => setDetailsTab("items")}>Состав заказа</button><button className={detailsTab === "info" ? "active" : ""} onClick={() => setDetailsTab("info")}>Информация</button></div>
          {detailsTab === "items" && <><div className="line-items">{currentOrder.lines.length ? currentOrder.lines.map(line => { const dish = dishes.find(d => d.id === line.id); if (!dish) return null; return <div className="line-item" key={line.id}>{dish.image ? <img src={dish.image} alt=""/> : <div className="line-photo-placeholder" role="img" aria-label={`Нет фото: ${dish.name}`}>Без фото</div>}<div className="line-copy"><b>{dish.name}</b><small>{dish.weight} · {rub(dish.price)} за шт.</small></div><div className="quantity"><button aria-label={`Уменьшить количество: ${dish.name}`} onClick={() => changeQuantity(line.id, -1)}><Icon name="minus" size={16}/></button><span>{line.quantity}</span><button aria-label={`Увеличить количество: ${dish.name}`} onClick={() => changeQuantity(line.id, 1)}><Icon name="plus" size={16}/></button></div><strong className="line-price">{rub(dish.price * line.quantity)}</strong><button className="remove-button" aria-label={`Удалить ${dish.name}`} onClick={() => removeDish(line.id)}><Icon name="close" size={16}/></button></div>; }) : <div className="empty-state">В заказе пока нет блюд</div>}</div><button className="add-button" onClick={() => setAddOpen(true)}><Icon name="plus" size={19}/> Добавить блюдо</button><div className="total-row"><span>Сумма блюд</span><strong>{rub(total(currentOrder))}</strong></div><label className="status-editor"><span>Статус заказа</span><select value={currentOrder.status} onChange={e => setStatus(e.target.value as Status)}>{orderStatusesFor(currentOrder.type).map(status => <option key={status} value={status}>{status}</option>)}</select></label></>}
          <div className="order-info"><div><span>Гость</span><strong>{currentOrder.guest}</strong></div><div><span>Связь</span><GuestContactActions phone={contact.whatsappDisplay} channels={guestChannels} preferredChannel={currentOrder.preferredChannel}/></div><div><span>Тип заказа</span><strong>{currentOrder.type}</strong></div><div><span>Адрес</span><strong>{currentOrder.address}</strong></div><div><span>Оплата</span><strong>При получении</strong></div><div><span>Комментарий</span><strong>{currentOrder.note || "Нет комментария"}</strong></div></div>
        </section>
        <aside className="right-rail"><div className="panel bookings-widget"><div className="section-heading"><h2>Брони</h2><button className="text-link" onClick={() => setSection("bookings")}>Все брони</button></div><div className="booking-list compact">{bookings.map(booking => <button key={booking.id} className={`booking-card ${booking.status === "Новая" ? "fresh" : ""}`} onClick={() => { setSelectedBookingId(booking.id); setSection("bookings"); }}><div><strong>{booking.time}</strong><small>{booking.guests} гостя · {booking.guest}</small></div><span className={`status-badge ${booking.status === "Новая" ? "ready" : "done"}`}>{booking.status}</span><Icon name="chevron" size={17}/></button>)}</div></div></aside>
      </div>}

      {section === "bookings" && <div className="subpage"><div className="page-intro"><span className="eyebrow">Зал ресторана</span><h1>Брони</h1><p>Предстоящие бронирования и пожелания гостей.</p></div><div className="bookings-layout"><section className="panel booking-main"><div className="section-heading"><h2>Предстоящие</h2><span className="count-pill">{bookings.length}</span></div><div className="booking-list">{bookings.map(b => <button key={b.id} className={`booking-card ${selectedBookingId === b.id ? "selected" : ""}`} onClick={() => setSelectedBookingId(b.id)}><div><strong>{b.time}</strong><small>{b.guest} · {b.guests} гостя</small></div><span className={`status-badge ${b.status === "Новая" ? "ready" : "done"}`}>{b.status}</span><Icon name="chevron" size={18}/></button>)}</div></section><section className="panel booking-detail"><span className="eyebrow">Бронь № {currentBooking.id}</span><h2>{currentBooking.time}</h2><div className="booking-facts"><div><span>Имя</span><strong>{currentBooking.guest}</strong></div><div><span>Связь</span><GuestContactActions phone={contact.whatsappDisplay} channels={guestChannels}/></div><div><span>Гостей</span><strong>{currentBooking.guests}</strong></div><div><span>Пожелание</span><strong>{currentBooking.note || "Нет"}</strong></div><div><span>Статус</span><strong>{currentBooking.status}</strong></div></div><button className="primary-button full" disabled={currentBooking.status === "Подтверждена"} onClick={() => { setBookings(prev => prev.map(b => b.id === currentBooking.id ? { ...b, status: "Подтверждена" } : b)); notify("Бронь подтверждена"); }}>{currentBooking.status === "Подтверждена" ? "Бронь подтверждена" : "Подтвердить бронь"}</button></section></div></div>}

      {section === "menu" && <MenuPanel dishes={dishes} setDishes={setDishes} notify={notify}/>}

      {section === "settings" && <div className="subpage settings-page"><div className="settings-grid"><div className="panel settings-card"><div className="section-heading"><div><h2>Внешний вид</h2><p>Только для панели: тема сайта ресторана не меняется</p></div></div><div className="theme-choices"><button className={!dark ? "active" : ""} onClick={() => setDark(false)}><Icon name="sun"/> Светлая { !dark && <Icon name="check" size={16}/>}</button><button className={dark ? "active" : ""} onClick={() => setDark(true)}><Icon name="moon"/> Тёмная {dark && <Icon name="check" size={16}/>}</button></div><button className="outline-button full" onClick={() => setCollapsed(!collapsed)}>{collapsed ? "Развернуть" : "Свернуть"} боковую панель</button></div><div className="panel settings-card"><SoundSettings sound={sound} setSound={setSound} customName={customName} onUpload={file => uploadAudio(file.name, file)} onRemove={removeAudio} onTest={n => { playSound(n); if (!n) notify("Звук воспроизведён"); }}/></div><div className="panel settings-card"><h2>Администратор</h2><p className="muted">Профиль администратора ресторана.</p><div className="admin-card"><span className="avatar">АД</span><div><strong>Администратор</strong><small>Управление рестораном</small></div></div></div><SettingsSections notify={notify} guestChannels={guestChannels} onGuestChannelChange={changeGuestChannel}/></div></div>}
    </div>
    {addOpen && <OrderDishPicker dishes={dishes} orderId={selectedOrderId} onPick={addDish} onClose={() => setAddOpen(false)}/>}
    {toast && <div className="toast" role="status"><Icon name="check" size={18}/>{toast}</div>}
  </div>;
}






