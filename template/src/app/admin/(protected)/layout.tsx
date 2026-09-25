import { redirect } from "next/navigation";
import { getAdminActor } from "@/lib/admin-auth";
import { getSiteRestaurant, contentAssetUrl } from "@/lib/site";
import { AdminShell } from "./admin-shell";

export const dynamic = "force-dynamic";

export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const actor = await getAdminActor();
  if (!actor) redirect("/admin/login");
  const restaurant = await getSiteRestaurant();

  return (
    <>
      <style>{"body > header:first-of-type { display: none; }"}</style>
      <AdminShell restaurantName={restaurant.name} logo={restaurant.logo ? contentAssetUrl(restaurant.logo) : ""} actor={actor}>
        {children}
      </AdminShell>
    </>
  );
}
