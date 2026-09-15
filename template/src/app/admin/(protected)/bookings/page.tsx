import { getPrisma } from "@/lib/db";
import { BookingCard } from "./booking-card";

export const dynamic = "force-dynamic";

export default async function AdminBookingsPage() {
  const prisma = getPrisma();
  const bookings = await prisma.reservation.findMany({
    orderBy: [{ date: "desc" }, { time: "desc" }],
    take: 100,
  });

  return (
    <div>
      <h1 className="text-2xl mb-4">Брони</h1>
      {bookings.length === 0 ? (
        <p className="text-muted">Броней пока нет.</p>
      ) : (
        <div className="space-y-3">
          {bookings.map((booking) => (
            <BookingCard key={booking.id} booking={booking} />
          ))}
        </div>
      )}
    </div>
  );
}
