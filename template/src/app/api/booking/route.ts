import { NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { createReservationWithCapacity } from "@/lib/booking/capacity";

const bookingSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  guests: z.number().int().min(1).max(100),
  customerName: z.string().min(1).max(100),
  customerPhone: z.string().min(5).max(20),
  comment: z.string().max(500).default(""),
  website: z.string().max(0).optional(), // honeypot
});

function getClientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

export async function POST(request: Request) {
  if (!rateLimit(`booking:${getClientIp(request)}`, 5, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Слишком много заявок. Подождите несколько минут." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }

  const parsed = bookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Проверьте поля брони" }, { status: 400 });
  }

  // Валидация времени по часам работы ресторана
  const { getSiteSettings, getSiteRestaurant } = await import("@/lib/site");
  const { isValidBookingTime, resolveSchedule } = await import("@/lib/hours");
  const [settings, restaurant] = await Promise.all([getSiteSettings(), getSiteRestaurant()]);

  if (!settings.booking.enabled) {
    return NextResponse.json({ error: "Бронирование временно недоступно" }, { status: 400 });
  }

  const schedule = resolveSchedule(restaurant);

  // BUG-013: серверные проверки даты и minHoursAhead в часовом поясе ресторана
  const tz = (settings as { timezone?: string }).timezone ?? "Europe/Moscow";
  const { restaurantLocal } = await import("@/lib/delivery/slots");
  const local = restaurantLocal(new Date(), tz);

  if (parsed.data.date < local.date) {
    return NextResponse.json({ error: "Нельзя забронировать на прошедшую дату" }, { status: 400 });
  }
  if (parsed.data.date === local.date) {
    const [h, m] = parsed.data.time.split(":").map(Number);
    if (h * 60 + m < local.minutes + settings.booking.minHoursAhead * 60) {
      return NextResponse.json(
        { error: `Бронь возможна не раньше чем через ${settings.booking.minHoursAhead} ч.` },
        { status: 400 },
      );
    }
  }

  if (!isValidBookingTime(schedule, parsed.data.date, parsed.data.time, settings.booking.slotMinutes)) {
    return NextResponse.json(
      { error: "На это время бронь недоступна — выберите время в часы работы ресторана" },
      { status: 400 },
    );
  }

  // Привязка к авторизованному гостю (если сессия есть)
  let customerId: string | null = null;
  try {
    const { getSessionCustomer } = await import("@/lib/auth");
    const sessionCustomer = await getSessionCustomer();
    customerId = sessionCustomer?.id ?? null;
  } catch {
    // анонимная бронь
  }

  // BUG-013: lock, aggregate and create must share one transaction.
  const prisma = getPrisma();
  const reservation = await prisma.$transaction(async (tx) =>
    createReservationWithCapacity(
      tx,
      { date: parsed.data.date, time: parsed.data.time, guests: parsed.data.guests },
      settings.booking.maxGuestsPerSlot,
      {
        customerId,
        date: parsed.data.date,
        time: parsed.data.time,
        guests: parsed.data.guests,
        customerName: parsed.data.customerName,
        customerPhone: parsed.data.customerPhone,
        comment: parsed.data.comment,
        status: "new",
      },
    ),
  );

  if (!reservation) {
    return NextResponse.json(
      { error: "На это время мест больше нет — выберите другое время" },
      { status: 400 },
    );
  }

  try {
    const { notifyNewBooking } = await import("@/lib/notify");
    await notifyNewBooking(reservation.id);
  } catch {
    // уведомления не должны ронять бронь
  }

  // Мгновенный репорт метрик на платформу (fire-and-forget)
  try {
    const { runMetricsReport } = await import("@/lib/metrics-report");
    void runMetricsReport().catch(() => {});
  } catch {
    // метрики не должны ронять бронь
  }

  return NextResponse.json({ ok: true, id: reservation.id });
}
