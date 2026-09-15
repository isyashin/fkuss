import { getSiteRestaurant } from "@/lib/site";
import { resolveSchedule } from "@/lib/hours";
import { RestaurantAdmin } from "./restaurant-admin";

export const dynamic = "force-dynamic";

export default async function AdminRestaurantPage() {
  const restaurant = await getSiteRestaurant();
  const schedule = resolveSchedule(restaurant);

  return (
    <div>
      <h1 className="text-2xl mb-4">Ресторан</h1>
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
    </div>
  );
}
