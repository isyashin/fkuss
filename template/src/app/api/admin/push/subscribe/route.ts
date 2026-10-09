import { NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { revokePushInstall, touchPushInstall, upsertPushSubscription } from "@/lib/admin-push";
import { clientIp, originMatches, readJsonBody, requirePushActor } from "../shared";

export const dynamic = "force-dynamic";

const installIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

const subscribeSchema = z.object({
  installId: installIdSchema,
  endpoint: z.url().max(500),
  keys: z.object({
    p256dh: z.string().min(1).max(300),
    auth: z.string().min(1).max(150),
  }),
  userAgent: z.string().max(250).optional(),
});

const MAX_SUBSCRIBE_PER_WINDOW = 20;

/** Регистрация/обновление подписки устройства текущего администратора. */
export async function POST(request: Request) {
  const actor = await requirePushActor(request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!originMatches(request)) return NextResponse.json({ error: "Некорректный запрос" }, { status: 403 });
  if (!rateLimit(`push-subscribe:${actor.id}:${clientIp(request)}`, MAX_SUBSCRIBE_PER_WINDOW, 10 * 60 * 1000)) {
    return NextResponse.json({ error: "Слишком много попыток. Подождите несколько минут." }, { status: 429 });
  }

  const body = await readJsonBody(request);
  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Некорректная подписка" }, { status: 400 });

  try {
    await upsertPushSubscription(getPrisma(), actor.id, {
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      installId: parsed.data.installId,
      userAgent: parsed.data.userAgent,
    });
  } catch {
    return NextResponse.json({ error: "Не удалось сохранить подписку" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/** Отключение уведомлений на текущем устройстве (остальные устройства сохраняются). */
export async function DELETE(request: Request) {
  const actor = await requirePushActor(request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!originMatches(request)) return NextResponse.json({ error: "Некорректный запрос" }, { status: 403 });

  const body = await readJsonBody(request);
  const parsed = z.object({ installId: installIdSchema }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });

  await revokePushInstall(getPrisma(), parsed.data.installId);
  return NextResponse.json({ ok: true });
}

/** Продление жизни подписки при авторизованном открытии приложения. */
export async function PATCH(request: Request) {
  const actor = await requirePushActor(request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!originMatches(request)) return NextResponse.json({ error: "Некорректный запрос" }, { status: 403 });

  const body = await readJsonBody(request);
  const parsed = z.object({ installId: installIdSchema }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });

  await touchPushInstall(getPrisma(), parsed.data.installId);
  return NextResponse.json({ ok: true });
}
