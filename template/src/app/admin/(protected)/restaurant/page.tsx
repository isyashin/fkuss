import { getSiteRestaurant } from "@/lib/site";
import { requireAdminPermission } from "@/lib/admin-auth";
import { resolveSchedule } from "@/lib/hours";
import { RestaurantAdmin } from "./restaurant-admin";
import { AdminSettingsSubpage } from "../admin-settings-subpage";

export const dynamic = "force-dynamic";

export default async function AdminRestaurantPage() {
  await requireAdminPermission("manage");
  const restaurant = await getSiteRestaurant();
  const schedule = resolveSchedule(restaurant);

  return (
    <AdminSettingsSubpage title="Ресторан" description="Контакты, время работы и оформление карточки ресторана.">
      <RestaurantAdmin
        initial={{
          name: restaurant.name,
          phone: restaurant.phone,
          email: restaurant.email,
          address: restaurant.address,
          socials: restaurant.socials,
          schedule,
        }}
      />
    </AdminSettingsSubpage>
  );
}
