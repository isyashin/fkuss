import { NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { createWebPushTransport, findActivePushInstall, isPushConfigured, pushErrorCode } from "@/lib/admin-push";
import { clientIp, originMatches, readJsonBody, requirePushActor } from "../shared";

export const dynamic = "force-dynamic";

const TEST_PER_WINDOW = 5;

/** Собственный тестовый push текущего устройства — из профиля, после явного нажатия. */
export async function POST(request: Request) {
  const actor = await requirePushActor(request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!originMatches(request)) return NextResponse.json({ error: "Некорректный запрос" }, { status: 403 });
  if (!isPushConfigured()) return NextResponse.json({ error: "Уведомления не настроены на этом сайте" }, { status: 503 });
  if (!rateLimit(`push-test:${actor.id}:${clientIp(request)}`, TEST_PER_WINDOW, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Слишком много проверок. Подождите несколько минут." }, { status: 429 });
  }

  const body = await readJsonBody(request);
  const parsed = z.object({ installId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });

  const prisma = getPrisma();
  const found = await findActivePushInstall(prisma, actor.id, parsed.data.installId);
  if (!found) return NextResponse.json({ error: "Уведомления на этом устройстве не включены" }, { status: 409 });

  try {
    await createWebPushTransport().send(
      { endpoint: found.subscription.endpoint, p256dh: found.subscription.p256dh, auth: found.subscription.auth },
      { eventId: "test", kind: "test", reference: "", label: "Проверка уведомлений" },
    );
  } catch (error) {
    if (pushErrorCode(error) === "gone") {
      // Подписка протухла на стороне провайдера — предлагаем включить заново
      const { revokePushInstall } = await import("@/lib/admin-push");
      await revokePushInstall(prisma, parsed.data.installId);
      return NextResponse.json({ error: "Подписка устарела — включите уведомления заново", stale: true }, { status: 409 });
    }
    return NextResponse.json({ error: "Не удалось отправить. Проверьте сеть и настройки браузера." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
