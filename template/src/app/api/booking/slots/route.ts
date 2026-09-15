import { NextResponse } from "next/server";
import { getSiteSettings, getSiteRestaurant } from "@/lib/site";
import { generateSlots, resolveSchedule } from "@/lib/hours";

/** Доступные слоты брони на дату: GET /api/booking/slots?date=YYYY-MM-DD */
export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date=YYYY-MM-DD" }, { status: 400 });
  }

  const [settings, restaurant] = await Promise.all([getSiteSettings(), getSiteRestaurant()]);
  if (!settings.booking.enabled) {
    return NextResponse.json({ slots: [], bookingDisabled: true });
  }

  const schedule = resolveSchedule(restaurant);
  const slots = generateSlots(schedule, date, settings.booking.slotMinutes);

  // Отсекаем прошедшее для «сегодня» с учётом minHoursAhead
  const now = new Date();
  const todayUtc = now.toISOString().slice(0, 10);
  let available = slots;
  if (date === todayUtc) {
    const minMinutes =
      now.getUTCHours() * 60 + now.getUTCMinutes() + settings.booking.minHoursAhead * 60;
    available = slots.filter((s) => {
      const [h, m] = s.split(":").map(Number);
      return h * 60 + m >= minMinutes;
    });
  }

  return NextResponse.json({ slots: available });
}
