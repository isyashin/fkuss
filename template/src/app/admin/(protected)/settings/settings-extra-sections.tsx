import Link from "next/link";
import { getPrisma } from "@/lib/db";
import { contentAssetUrl, getSiteRestaurant, getSiteSettings, getSiteTheme } from "@/lib/site";
import { resolveSchedule } from "@/lib/hours";
import { fetchMyBilling } from "@/lib/platform";
import {
  createDefaultPrintMaterial,
  normalizePrintMaterialsSettings,
  withCanonicalQrUrl,
  type PrintBrand,
  type PrintMaterialsSettings,
} from "@/lib/print-materials";
import { RestaurantAdmin } from "../restaurant/restaurant-admin";
import { DeliveryAdmin } from "../delivery/delivery-admin";
import { PromosAdmin } from "../promos/promos-admin";
import { GalleryAdmin } from "../gallery/gallery-admin";
import { BanquetsAdmin } from "../banquets/banquets-admin";
import { PagesAdmin } from "../pages/pages-admin";
import { SyncAdmin } from "../sync/sync-admin";
import { PrintMaterialsAdmin } from "../print-materials/print-materials-admin";
import { TopupForm } from "../billing/topup-form";
import styles from "./settings-admin.module.css";

export async function RestaurantSettingsSection() {
  const restaurant = await getSiteRestaurant();
  return <section className={`${styles.card} ${styles.extraCard}`} id="restaurant">
    <h2>Ресторан</h2>
    <p className={styles.cardHint}>Контакты, логотип и часы работы</p>
    <RestaurantAdmin initial={{
      name: restaurant.name,
      phone: restaurant.phone,
      email: restaurant.email,
      address: restaurant.address,
      socials: restaurant.socials,
      schedule: resolveSchedule(restaurant),
    }}/>
  </section>;
}

export async function OtherSettingsSections() {
  const prisma = getPrisma();
  const [restaurant, settings, theme, options, promos, images, halls, pages, syncState, printStored, billing] = await Promise.all([
    getSiteRestaurant(),
    getSiteSettings(),
    getSiteTheme(),
    prisma.deliveryOption.findMany({ orderBy: { position: "asc" } }),
    prisma.promo.findMany({ orderBy: { position: "asc" } }),
    prisma.galleryImage.findMany({ orderBy: { position: "asc" } }),
    prisma.banquetHall.findMany({ orderBy: { position: "asc" } }),
    prisma.page.findMany(),
    prisma.settings.findUnique({ where: { key: "syncState" } }),
    prisma.settings.findUnique({ where: { key: "printMaterials" } }),
    fetchMyBilling(),
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
  const brand: PrintBrand = {
    name: restaurant.name,
    phone: restaurant.phone,
    address: restaurant.address,
    logoUrl: restaurant.logo ? contentAssetUrl(restaurant.logo) : "",
  };

  return <>
    <section className={`${styles.card} ${styles.extraCard}`} id="delivery-options">
      <h2>Варианты доставки</h2><p className={styles.cardHint}>Интервалы, стоимость и особые дни</p>
      <DeliveryAdmin options={options}/>
    </section>
    <section className={`${styles.card} ${styles.extraCard}`} id="promos">
      <h2>Акции</h2><p className={styles.cardHint}>Тексты действующих предложений</p>
      <PromosAdmin promos={promos}/>
    </section>
    <section className={`${styles.card} ${styles.extraCard}`} id="gallery">
      <h2>Галерея</h2><p className={styles.cardHint}>Фото текущего ресторана</p>
      <GalleryAdmin images={images}/>
    </section>
    <section className={`${styles.card} ${styles.extraCard}`} id="banquets">
      <h2>Банкеты</h2><p className={styles.cardHint}>Описание раздела и залы</p>
      <BanquetsAdmin settings={(settings as { banquets?: Record<string, unknown> }).banquets ?? {}} halls={halls}/>
    </section>
    <section className={`${styles.card} ${styles.extraCard}`} id="pages">
      <h2>Страницы сайта</h2><p className={styles.cardHint}>Тексты страниц ресторана</p>
      <PagesAdmin pages={pages}/>
    </section>
    <section className={`${styles.card} ${styles.extraCard}`} id="sync">
      <h2>Синхронизация</h2><p className={styles.cardHint}>Меню Яндекс.Еды и расписание обновлений</p>
      <SyncAdmin settings={settings} syncState={(syncState?.value ?? {}) as Record<string, unknown>}/>
    </section>
    <section className={`${styles.card} ${styles.extraCard}`} id="print-materials">
      <h2>Печатные материалы</h2><p className={styles.cardHint}>Визитка и магнит с QR-ссылкой</p>
      <PrintMaterialsAdmin initialSettings={printSettings} brand={brand} restaurantSlug={restaurant.slug}/>
    </section>
    <section className={`${styles.card} ${styles.extraCard}`} id="billing">
      <h2>Подписка</h2><p className={styles.cardHint}>Баланс, тариф, счета и активность платформы</p>
      {billing ? <div className={styles.billingGrid}>
        <div><span>Баланс</span><strong>{(billing.balanceKopecks / 100).toLocaleString("ru-RU")} ₽</strong></div>
        <div><span>Тариф</span><strong>{billing.tariff?.name ?? "Не назначен"}</strong></div>
        <div><span>Счета</span><strong>{billing.invoices.length}</strong></div>
        <div><span>Активность</span><strong>{billing.metrics.length} дн.</strong></div>
      </div> : <p className={styles.cardHint}>Платформа не подключена к этому сайту.</p>}
      {billing && <TopupForm/>}
      <Link className={styles.outlineLink} href="/admin/billing">Все счета и активность</Link>
    </section>
    <section className={`${styles.card} ${styles.extraCard}`} id="team">
      <h2>Сотрудники</h2><p className={styles.cardHint}>Личные учётные записи и права доступа</p>
      <Link className={styles.outlineLink} href="/admin/team">Управлять сотрудниками</Link>
    </section>
  </>;
}
