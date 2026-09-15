import { NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

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
  if (!isValidBookingTime(schedule, parsed.data.date, parsed.data.time, settings.booking.slotMinutes)) {
    return NextResponse.json(
      { error: "На это время бронь недоступна — выберите время в часы работы ресторана" },
      { status: 400 },
    );
  }

  const prisma = getPrisma();
  const reservation = await prisma.reservation.create({
    data: {
      date: parsed.data.date,
      time: parsed.data.time,
      guests: parsed.data.guests,
      customerName: parsed.data.customerName,
      customerPhone: parsed.data.customerPhone,
      comment: parsed.data.comment,
      status: "new",
    },
  });

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
