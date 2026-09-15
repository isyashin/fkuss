import { getSiteMenu, getSiteSettings, getSiteRestaurant } from "@/lib/site";
import { MenuClient } from "@/components/menu/menu-client";
import { isOpenAt, resolveSchedule } from "@/lib/hours";

export const dynamic = "force-dynamic";

export default async function MenuPage() {
  const [menu, settings, restaurant] = await Promise.all([
    getSiteMenu(),
    getSiteSettings(),
    getSiteRestaurant(),
  ]);

  const schedule = resolveSchedule(restaurant);
  const now = new Date();
  const open = isOpenAt(
    schedule,
    now.toISOString().slice(0, 10),
    `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`,
  );

  return (
    <MenuClient
      menu={menu}
      delivery={settings.delivery}
      loyalty={settings.loyalty}
      whatsapp={settings.channels.whatsapp}
      isOpen={open}
    />
  );
}
