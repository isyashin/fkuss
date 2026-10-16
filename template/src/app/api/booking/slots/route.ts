import { NextResponse } from "next/server";
import { getSiteSettings, getSiteRestaurant } from "@/lib/site";
import { generateSlots, resolveSchedule } from "@/lib/hours";
import { isValidLocalDate, localMinutes } from "@/lib/local-date";

/** Доступные слоты брони на дату: GET /api/booking/slots?date=YYYY-MM-DD */
export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date") ?? "";
  if (!isValidLocalDate(date)) {
    return NextResponse.json({ error: "date=YYYY-MM-DD" }, { status: 400 });
  }

  const [settings, restaurant] = await Promise.all([getSiteSettings(), getSiteRestaurant()]);
  if (!settings.booking.enabled) {
    return NextResponse.json({ slots: [], bookingDisabled: true });
  }

  const schedule = resolveSchedule(restaurant);
  const slots = generateSlots(schedule, date, settings.booking.slotMinutes);

  // Отсекаем прошедшее для «сегодня» с учётом minHoursAhead — в tz ресторана
  const tz = (settings as { timezone?: string }).timezone ?? "Europe/Moscow";
  const { restaurantLocal } = await import("@/lib/delivery/slots");
  const local = restaurantLocal(new Date(), tz);
  const cutoff = localMinutes(local.date, "00:00") + local.minutes + settings.booking.minHoursAhead * 60;
  const available = slots.filter((time) => localMinutes(date, time) >= cutoff);

  return NextResponse.json({ slots: available });
}
