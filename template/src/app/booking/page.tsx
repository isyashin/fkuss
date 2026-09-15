import { getSiteSettings } from "@/lib/site";
import { BookingForm } from "@/components/booking/booking-form";

export const dynamic = "force-dynamic";

export default async function BookingPage() {
  const settings = await getSiteSettings();

  if (!settings.booking.enabled) {
    return (
      <main className="flex-1 mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-2xl">Бронирование временно недоступно</h1>
        <p className="text-muted mt-2">Позвоните нам — подберём столик по телефону.</p>
      </main>
    );
  }

  return (
    <main className="flex-1 mx-auto w-full max-w-xl px-4 py-8">
      <h1 className="text-3xl mb-6">Бронирование столика</h1>
      <BookingForm booking={settings.booking} />
    </main>
  );
}
