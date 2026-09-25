import { getPrisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/admin-auth";
import { parseOrderListQuery, type RawAdminQuery } from "@/lib/admin-list-query";
import { loadOrdersPage } from "./admin-list-data";
import { OrdersDashboard } from "./orders-dashboard";
import { getSiteSettings } from "@/lib/site";
import { visibleGuestChannels } from "@/lib/guest-contact";
import { loadUpcomingBookings } from "@/lib/admin-bookings-service";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<RawAdminQuery> }) {
  const actor = await requireAdminPermission("orders");
  const prisma = getPrisma();
  const query = parseOrderListQuery(await searchParams);
  const listing = await loadOrdersPage(prisma, query);
  const [categories, options, settings] = await Promise.all([
    prisma.category.findMany({ orderBy: { position: "asc" }, include: {
      dishes: { where: { available: true }, orderBy: { position: "asc" }, include: {
        modifiers: true, modifierGroups: { orderBy: { position: "asc" }, include: { modifiers: true } },
      } },
    } }),
    prisma.deliveryOption.findMany({ where: { enabled: true }, orderBy: { position: "asc" }, select: { id: true, name: true } }),
    getSiteSettings(),
  ]);
  const upcomingBookings = await loadUpcomingBookings(prisma, settings.timezone);
  const catalog = categories.map((category) => ({ id: category.id, name: category.name, dishes: category.dishes.map((dish) => ({
    id: dish.id, name: dish.name, price: dish.price,
    modifiers: dish.modifiers.filter((modifier) => modifier.groupId === null).map((modifier) => ({ id: modifier.id, name: modifier.name, price: modifier.price })),
    groups: dish.modifierGroups.map((group) => ({ id: group.id, name: group.name, minSelected: group.minSelected,
      maxSelected: group.maxSelected, modifiers: group.modifiers.map((modifier) => ({ id: modifier.id, name: modifier.name, price: modifier.price })) })),
  })) }));

  return <OrdersDashboard {...listing} query={{ ...query, page: listing.page }} catalog={catalog}
    deliveryOptions={options} deliveryZones={settings.delivery.zones.map((zone) => ({ name: zone.name }))}
    guestContact={visibleGuestChannels(settings)} upcomingBookings={upcomingBookings} canManageMenu={actor.role === "owner"}/>;
}
