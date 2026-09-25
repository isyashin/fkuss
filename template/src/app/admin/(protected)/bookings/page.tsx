import { getPrisma } from "@/lib/db";
import { requireAdminPermission } from "@/lib/admin-auth";
import { parseBookingListQuery, type RawAdminQuery } from "@/lib/admin-list-query";
import { loadBookingsPage } from "../admin-list-data";
import { BookingsDashboard } from "./bookings-dashboard";
import { getSiteSettings } from "@/lib/site";
import { visibleGuestChannels } from "@/lib/guest-contact";

export const dynamic = "force-dynamic";

export default async function AdminBookingsPage({ searchParams }: { searchParams: Promise<RawAdminQuery> }) {
  await requireAdminPermission("bookings");
  const prisma = getPrisma();
  const raw = await searchParams;
  const query = parseBookingListQuery(raw);
  const selectedId = typeof raw.selected === "string" && raw.selected.length <= 100 ? raw.selected : null;
  const [listing, settings, selectedBooking] = await Promise.all([
    loadBookingsPage(prisma, query), getSiteSettings(),
    selectedId ? prisma.reservation.findUnique({ where: { id: selectedId } }) : Promise.resolve(null),
  ]);

  return <BookingsDashboard {...listing} query={{ ...query, page: listing.page }} guestContact={visibleGuestChannels(settings)} timeZone={settings.timezone}
    initialSelectedId={selectedId} selectedBooking={selectedBooking}/>;
}
