import { getPrisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/admin-auth";
import { getSiteRestaurant, getSiteSettings } from "@/lib/site";
import { geocodeAddress } from "@/lib/delivery/geocoder";
import { AdminSettingsSubpage } from "../admin-settings-subpage";
import { DeliveryTabs } from "./delivery-tabs";

export const dynamic = "force-dynamic";

export default async function AdminDeliveryPage() {
  await requireAdminPermission("manage");
  const prisma = getPrisma();
  const [options, settings, restaurant] = await Promise.all([
    prisma.deliveryOption.findMany({ orderBy: { position: "asc" } }),
    getSiteSettings(),
    getSiteRestaurant(),
  ]);

  // Центр карты — геокодинг адреса ресторана на сервере (ключ геокодера).
  // Не нашлось/нет ключа — карта откроется по полигонам зон или дефолту.
  let restaurantCenter: { lat: number; lng: number } | null = null;
  if (restaurant.address.trim()) {
    const geo = await geocodeAddress(restaurant.address);
    if (geo.ok) restaurantCenter = { lat: geo.point.lat, lng: geo.point.lng };
  }

  return (
    <AdminSettingsSubpage
      title="Доставка"
      description="Зоны на карте с условиями по сумме заказа и варианты с интервалами."
    >
      <DeliveryTabs
        options={options}
        settings={settings}
        restaurantCenter={restaurantCenter}
        ymapsKey={process.env.YANDEX_MAPS_API_KEY ?? ""}
      />
    </AdminSettingsSubpage>
  );
}
