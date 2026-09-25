import type { PrismaClient } from "@/generated/prisma/client";
import { nowInTimeZone } from "./hours";

export type AdminBookingTarget = "confirmed" | "rejected" | "cancelled";

export async function applyAdminBookingStatus(prisma: PrismaClient, id: string, target: AdminBookingTarget): Promise<void> {
  const result = await prisma.reservation.updateMany({
    where: { id, status: target === "cancelled" ? { in: ["new", "confirmed"] } : "new" },
    data: { status: target },
  });
  if (result.count !== 1) throw new Error("Бронь уже изменена или не найдена. Обновите страницу.");
}

export function loadUpcomingBookings(prisma: PrismaClient, timeZone: string, now = new Date()) {
  const today = nowInTimeZone(timeZone, now).date;
  return prisma.reservation.findMany({
    where: { status: { in: ["new", "confirmed"] }, date: { gte: today } },
    orderBy: [{ date: "asc" }, { time: "asc" }],
    take: 10,
  });
}
