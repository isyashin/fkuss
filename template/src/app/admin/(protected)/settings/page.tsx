import { redirect } from "next/navigation";
import Link from "next/link";
import { getAdminActor } from "@/lib/admin-auth";
import { isPinUnlocked } from "@/lib/admin-pin";
import { contentAssetUrl, getSiteRestaurant, getSiteSettings, getSiteTheme, getSitePromos } from "@/lib/site";
import { readAdminSound, publicAdminSound } from "@/lib/admin-sound";
import { getPrisma } from "@/lib/db";
import { resolveSchedule } from "@/lib/hours";
import { createDefaultPrintMaterial, normalizePrintMaterialsSettings, withCanonicalQrUrl, type PrintBrand, type PrintMaterialsSettings } from "@/lib/print-materials";
import { RestaurantAdmin } from "../restaurant/restaurant-admin";
import { PromosAdmin } from "../promos/promos-admin";
import { GalleryAdmin } from "../gallery/gallery-admin";
import { BanquetsAdmin } from "../banquets/banquets-admin";
import { PagesAdmin } from "../pages/pages-admin";
import { SyncAdmin } from "../sync/sync-admin";
import { PrintMaterialsAdmin } from "../print-materials/print-materials-admin";
import { DeliveryTabs } from "../delivery/delivery-tabs";
import { geocodeAddress } from "@/lib/delivery/geocoder";
import { GuestCabinetSettings } from "./guest-cabinet-settings";
import { SoundSettings } from "./sound-settings";
import { normalizeGuestCabinet } from "@/lib/guest-cabinet";
import { ThemeEditor } from "./sections/theme-editor";
import { DeliveryEditor } from "./sections/delivery-editor";
import { PaymentLoyaltyEditor, PricingEditor, BookingEditor } from "./sections/editors";
import { GuestContactEditor, NotifyChannelsEditor } from "./sections/guest-contact-editors";
import { TeamAdmin } from "../team/team-admin";
import { BillingView } from "../billing/billing-view";
import { fetchMyBilling } from "@/lib/platform";
import { PinGate } from "./pin-gate";
import styles from "./settings-redesign.module.css";

export const dynamic = "force-dynamic";

const GROUPS: { group: string; items: { id: string; title: string }[] }[] = [
  { group: "Ресторан", items: [{ id: "restaurant", title: "Данные и контакты" }, { id: "hours", title: "Часы работы" }] },
  { group: "Сайт", items: [{ id: "theme", title: "Оформление" }, { id: "pages", title: "Страницы" }, { id: "gallery", title: "Фотографии" }, { id: "promos", title: "Акции" }, { id: "banquets", title: "Банкеты" }, { id: "print", title: "Печатные материалы" }] },
  { group: "Заказы и брони", items: [{ id: "delivery", title: "Доставка и самовывоз" }, { id: "payment", title: "Оплата и бонусы" }, { id: "booking", title: "Бронирование" }] },
  { group: "Меню", items: [{ id: "pricing", title: "Правила цен" }, { id: "sync", title: "Импорт из Яндекс.Еды" }] },
  { group: "Связь", items: [{ id: "guest-contact", title: "Связь с гостем" }, { id: "notify", title: "Уведомления" }, { id: "cabinet", title: "Личный кабинет гостя" }, { id: "sound", title: "Звук уведомлений" }] },
  { group: "Доступ и подписка", items: [{ id: "team", title: "Сотрудники" }, { id: "billing", title: "Подписка" }] },
];
const VALID = new Set(GROUPS.flatMap((g) => g.items.map((i) => i.id)));

/* Серверные обёртки секций: данные грузятся только для активной секции. */
async function SectionRestaurant() {
  const restaurant = await getSiteRestaurant();
  return <div className={styles.legacyCard}>
    <h2>Данные и контакты</h2>
    <p className={styles.editorHint}>Название, телефон, email, адрес, соцсети и логотип. Часы работы — ниже в карточке ресторана.</p>
    <RestaurantAdmin initial={{
      name: restaurant.name, phone: restaurant.phone, email: restaurant.email,
      address: restaurant.address, socials: restaurant.socials, schedule: resolveSchedule(restaurant),
    }} logoUrl={restaurant.logo ? contentAssetUrl(restaurant.logo) : ""} />
  </div>;
}

async function SectionPromos() {
  const promos = await getPrisma().promo.findMany({ orderBy: { position: "asc" } });
  return <div className={styles.legacyCard}><h2>Акции</h2><p className={styles.editorHint}>Тексты действующих предложений</p><PromosAdmin promos={promos} /></div>;
}

async function SectionGallery() {
  const images = await getPrisma().galleryImage.findMany({ orderBy: { position: "asc" } });
  return <div className={styles.legacyCard}><h2>Фотографии</h2><p className={styles.editorHint}>Фото текущего ресторана</p><GalleryAdmin images={images} /></div>;
}

async function SectionBanquets({ settings }: { settings: Awaited<ReturnType<typeof getSiteSettings>> }) {
  const halls = await getPrisma().banquetHall.findMany({ orderBy: { position: "asc" } });
  return <div className={styles.legacyCard}><h2>Банкеты</h2><p className={styles.editorHint}>Описание раздела и залы</p><BanquetsAdmin settings={(settings as { banquets?: Record<string, unknown> }).banquets ?? {}} halls={halls} /></div>;
}

async function SectionPages() {
  const pages = await getPrisma().page.findMany();
  return <div className={styles.legacyCard}><h2>Страницы</h2><p className={styles.editorHint}>Тексты страниц ресторана</p><PagesAdmin pages={pages} /></div>;
}

async function SectionSync({ settings }: { settings: Awaited<ReturnType<typeof getSiteSettings>> }) {
  const syncState = await getPrisma().settings.findUnique({ where: { key: "syncState" } });
  const menuGroups = await getPrisma().menuGroup.findMany({ orderBy: { position: "asc" } });
  return <div className={styles.legacyCard}><h2>Импорт из Яндекс.Еды</h2><p className={styles.editorHint}>Источники меню и расписание обновлений</p>
    <SyncAdmin settings={settings} syncState={(syncState?.value ?? {}) as Record<string, unknown>} menus={menuGroups.map((m) => ({ id: m.id, name: m.name }))} /></div>;
}

async function SectionTeam() {
  const users = await getPrisma().adminUser.findMany({ orderBy: { createdAt: "asc" },
    select: { id: true, login: true, name: true, role: true, active: true, updatedAt: true } });
  return <div className={styles.legacyCard}><h2>Сотрудники</h2><p className={styles.editorHint}>Личные учётные записи и права в админке этого ресторана.</p>
    <TeamAdmin users={users} /></div>;
}

async function SectionBilling() {
  const billing = await fetchMyBilling();
  return <div className={styles.legacyCard}><h2>Подписка</h2><p className={styles.editorHint}>Баланс и тариф ресторана.</p>
    <BillingView billing={billing} /></div>;
}

async function SectionPrint() {
  const prisma = getPrisma();
  const [restaurant, settings, theme, printStored] = await Promise.all([
    getSiteRestaurant(), getSiteSettings(), getSiteTheme(),
    prisma.settings.findUnique({ where: { key: "printMaterials" } }),
  ]);
  const defaults: PrintMaterialsSettings = {
    card: createDefaultPrintMaterial("card", { canonical: settings.domains.canonical, accent: theme.accent }),
    magnet: createDefaultPrintMaterial("magnet", { canonical: settings.domains.canonical, accent: theme.accent }),
  };
  const normalized = normalizePrintMaterialsSettings(printStored?.value, defaults);
  const printSettings: PrintMaterialsSettings = {
    card: withCanonicalQrUrl(normalized.card, settings.domains.canonical),
    magnet: withCanonicalQrUrl(normalized.magnet, settings.domains.canonical),
  };
  const brand: PrintBrand = { name: restaurant.name, phone: restaurant.phone, address: restaurant.address, logoUrl: restaurant.logo ? contentAssetUrl(restaurant.logo) : "" };
  return <div className={styles.legacyCard}><h2>Печатные материалы</h2><p className={styles.editorHint}>Визитка и магнит с QR-ссылкой</p>
    <PrintMaterialsAdmin initialSettings={printSettings} brand={brand} restaurantSlug={restaurant.slug} /></div>;
}

async function SectionDeliveryZones({ settings }: { settings: Awaited<ReturnType<typeof getSiteSettings>> }) {
  const prisma = getPrisma();
  const [options, restaurant] = await Promise.all([
    prisma.deliveryOption.findMany({ orderBy: { position: "asc" } }),
    getSiteRestaurant(),
  ]);
  // Центр карты — геокодинг адреса ресторана (см. /admin/delivery).
  let restaurantCenter: { lat: number; lng: number } | null = null;
  if (restaurant.address.trim()) {
    const geo = await geocodeAddress(restaurant.address);
    if (geo.ok) restaurantCenter = { lat: geo.point.lat, lng: geo.point.lng };
  }
  return <div className={styles.editorCard}>
    <h2 className={styles.editorTitle}>Зоны и условия доставки</h2>
    <p className={styles.editorHint}>Geo-режим: полигональные зоны на карте с тарифами. Работает при наличии ключей Яндекс.Карт в среде сайта.</p>
    <DeliveryTabs options={options} settings={settings} restaurantCenter={restaurantCenter} ymapsKey={process.env.YANDEX_MAPS_API_KEY ?? ""} />
  </div>;
}

export default async function AdminSettingsPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const actor = await getAdminActor();
  if (!actor) redirect("/admin/login");

  // Сотрудник без PIN-unlock видит экран ввода PIN вместо настроек.
  const unlocked = actor.role === "owner" || (await isPinUnlocked(actor.id));
  if (!unlocked) return <PinGate />;

  const { section } = await searchParams;
  const active = section && VALID.has(section) ? section : "restaurant";
  const [settings, theme, sound] = await Promise.all([getSiteSettings(), getSiteTheme(), readAdminSound(getPrisma())]);

  const editor = (() => {
    switch (active) {
      case "restaurant":
      case "hours":
        return <SectionRestaurant />;
      case "theme": return <ThemeEditor theme={theme} />;
      case "pages": return <SectionPages />;
      case "gallery": return <SectionGallery />;
      case "promos": return <SectionPromos />;
      case "banquets": return <SectionBanquets settings={settings} />;
      case "print": return <SectionPrint />;
      case "delivery": return <><DeliveryEditor settings={settings} /><SectionDeliveryZones settings={settings} /></>;
      case "payment": return <PaymentLoyaltyEditor settings={settings} theme={theme} />;
      case "booking": return <BookingEditor settings={settings} />;
      case "pricing": return <PricingEditor settings={settings} theme={theme} />;
      case "sync": return <SectionSync settings={settings} />;
      case "guest-contact": return <GuestContactEditor settings={settings} />;
      case "notify": return <NotifyChannelsEditor settings={settings} />;
      case "cabinet":
        return <div className={styles.editorCard}><GuestCabinetSettings initial={normalizeGuestCabinet(settings)} /></div>;
      case "sound":
        return <div className={styles.editorCard}><SoundSettings initial={publicAdminSound(sound)} /></div>;
      case "team": return <SectionTeam />;
      case "billing": return <SectionBilling />;
      default: return <SectionRestaurant />;
    }
  })();

  return (
    <div className={styles.layout}>
      <nav className={styles.sectionsCol} aria-label="Разделы настроек">
        {GROUPS.map((g) => (
          <div key={g.group} className={styles.groupBlock}>
            <p className={styles.groupLabel}>{g.group}</p>
            {g.items.map((item) => (
              <Link key={item.id} href={`/admin/settings?section=${item.id}`}
                className={`${styles.sectionLink} ${active === item.id ? styles.current : ""}`}
                aria-current={active === item.id ? "page" : undefined}>
                {item.title}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className={styles.editor}>{editor}</div>
    </div>
  );
}
