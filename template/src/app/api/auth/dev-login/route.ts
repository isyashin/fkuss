import { NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/db";
import { issueGuestSession, attachGuestSession } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

/**
 * DEV-вход гостя без почтового кода. Работает только при DEV_GUEST_LOGIN=1
 * (выставляется вручную в dev-окружении; на проде отсутствует — роут отдаёт 404).
 */

const schema = z.object({ email: z.email() });

function getClientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "local";
}

export async function POST(request: Request) {
  if (process.env.DEV_GUEST_LOGIN !== "1") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { getSiteSettings } = await import("@/lib/site");
  const { isGuestCabinetEnabled } = await import("@/lib/guest-cabinet");
  if (!isGuestCabinetEnabled(await getSiteSettings())) {
    return NextResponse.json({ error: "Личный кабинет отключён" }, { status: 403 });
  }
  if (!rateLimit(`dev-login:${getClientIp(request)}`, 10, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Слишком много попыток" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Проверьте email" }, { status: 400 });
  }

  const sessionId = await issueGuestSession(getPrisma(), parsed.data.email.toLowerCase().trim());
  await attachGuestSession(sessionId);
  return NextResponse.json({ ok: true });
}
