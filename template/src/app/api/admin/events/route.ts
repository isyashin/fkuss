import { NextResponse } from "next/server";
import { getAdminActor } from "@/lib/admin-auth";
import { getPrisma } from "@/lib/db";
import { claimAdminEvents } from "@/lib/admin-events";
import { publicAdminSound, readAdminSound } from "@/lib/admin-sound";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await getAdminActor();
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const prisma = getPrisma();
  // Идентификатор вкладки: событие выдаётся каждой вкладке отдельно
  const rawTab = request.headers.get("x-admin-tab") ?? "default";
  const tabId = rawTab.slice(0, 64) || "default";
  const [events, sound, latest, pendingOrders, pendingBookings] = await Promise.all([
    claimAdminEvents(prisma, actor.id, tabId),
    readAdminSound(prisma),
    prisma.adminEvent.findFirst({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true } }),
    prisma.order.count({ where: { status: "new" } }),
    prisma.reservation.count({ where: { status: "new" } }),
  ]);
  return NextResponse.json({
    events,
    latestId: latest?.id ?? null,
    sound: publicAdminSound(sound),
    pending: { orders: pendingOrders, bookings: pendingBookings },
  }, { headers: { "Cache-Control": "no-store" } });
}
