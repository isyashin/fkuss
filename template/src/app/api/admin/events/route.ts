import { NextResponse } from "next/server";
import { getAdminActor } from "@/lib/admin-auth";
import { getPrisma } from "@/lib/db";
import { claimAdminEvents } from "@/lib/admin-events";
import { publicAdminSound, readAdminSound } from "@/lib/admin-sound";

export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await getAdminActor();
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const prisma = getPrisma();
  const [events, sound, latest] = await Promise.all([
    claimAdminEvents(prisma, actor.id), readAdminSound(prisma),
    prisma.adminEvent.findFirst({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true } }),
  ]);
  return NextResponse.json({ events, latestId: latest?.id ?? null, sound: publicAdminSound(sound) }, { headers: { "Cache-Control": "no-store" } });
}
