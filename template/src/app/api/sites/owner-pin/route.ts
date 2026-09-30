import { NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerPin, ownerPinSchema, setOwnerPin } from "@/lib/admin-pin";

/** Управление PIN владельца сайта — только с site key платформы. */
function authorized(request: Request): boolean {
  const key = process.env.SITE_KEY;
  return Boolean(key) && request.headers.get("x-site-key") === key;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ pin: await getOwnerPin() }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = z.object({ pin: z.string() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success || !ownerPinSchema.test(parsed.data.pin)) {
    return NextResponse.json({ error: "PIN: 4–6 цифр" }, { status: 400 });
  }
  await setOwnerPin(parsed.data.pin);
  return NextResponse.json({ ok: true });
}
