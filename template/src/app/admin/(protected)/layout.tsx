import { redirect } from "next/navigation";
import { getAdminActor } from "@/lib/admin-auth";
import { isPinUnlocked } from "@/lib/admin-pin";
import { getSiteRestaurant, contentAssetUrl } from "@/lib/site";
import { getPrisma } from "@/lib/db";
import { AdminShell } from "./admin-shell";

export const dynamic = "force-dynamic";

export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const actor = await getAdminActor();
  if (!actor) redirect("/admin/login");
  const prisma = getPrisma();
  const [restaurant, newOrdersCount, newBookingsCount, unlocked] = await Promise.all([
    getSiteRestaurant(),
    prisma.order.count({ where: { status: "new" } }),
    prisma.reservation.count({ where: { status: "new" } }),
    actor.role === "owner" ? Promise.resolve(true) : isPinUnlocked(actor.id),
  ]);

  return (
    <>
      <style>{"body > header:first-of-type { display: none; }"}</style>
      <AdminShell restaurantName={restaurant.name} logo={restaurant.logo ? contentAssetUrl(restaurant.logo) : ""} actor={actor}
        newOrdersCount={newOrdersCount} newBookingsCount={newBookingsCount} unlocked={unlocked}>
        {children}
      </AdminShell>
    </>
  );
}
