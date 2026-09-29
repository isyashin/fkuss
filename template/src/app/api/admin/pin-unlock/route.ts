import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminActor } from "@/lib/admin-auth";
import { ownerPinSchema, setPinUnlockCookie, verifyOwnerPin } from "@/lib/admin-pin";

const schema = z.object({ pin: z.string() });

function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "local";
}

/** Разблокировка уровня владельца PIN-кодом. */
export async function POST(request: Request) {
  const actor = await getAdminActor();
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !ownerPinSchema.test(parsed.data.pin)) {
    return NextResponse.json({ error: "PIN: 4–6 цифр" }, { status: 400 });
  }

  const result = await verifyOwnerPin(parsed.data.pin, actor.id, clientIp(request));
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Неверный PIN" }, { status: 400 });
  }
  await setPinUnlockCookie(actor.id);
  return NextResponse.json({ ok: true });
}
